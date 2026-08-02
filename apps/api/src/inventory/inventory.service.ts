import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
} from '@vp-parts-shop/shared';
import { AutopartsRepository, OwnStockRow } from './autoparts.repository';
import {
  SupplierStockRepository,
  SupplierStockRow,
} from './supplier-stock.repository';
import { DeliverySpeedResolver } from './delivery-speed.resolver';
import { DeliveryScheduleService } from './delivery-schedule.service';
import {
  BestOffer,
  OwnOffer,
  SupplierOffer,
  selectBestOffer,
} from './best-offer';
import {
  Warehouse,
  warehouseForOwnStock,
  warehouseForRule,
  warehousesFastestFirst,
} from './warehouse';
import { InventoryUnavailableException } from './inventory-unavailable.exception';

const DEFAULT_VAT_RATE = 0.2;

/** Resolved offers for a single article, ready for both selection paths. */
interface ResolvedOffers {
  own: OwnOffer | null;
  suppliers: SupplierOffer[];
}

const EMPTY_OFFERS: ResolvedOffers = { own: null, suppliers: [] };

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly vatRate: number;

  constructor(
    private readonly ownStock: AutopartsRepository,
    private readonly supplierStock: SupplierStockRepository,
    private readonly deliverySpeed: DeliverySpeedResolver,
    private readonly deliverySchedule: DeliveryScheduleService,
    config: ConfigService,
  ) {
    this.vatRate = config.get<number>('VAT_RATE') ?? DEFAULT_VAT_RATE;
  }

  /**
   * Live price & availability for one or many article numbers, keyed by number.
   *
   * This is the single availability read behind every surface — the buy box,
   * listing grid, search, substitutes, and the checkout re-check. It toggles
   * only the DB query by input size: one number takes the single-row read, many
   * take the batch read. Every entry then runs the same offer selection and
   * per-warehouse projection, so the request-time delivery dates are always
   * attached (the detail/list surfaces are dynamic, never cached).
   *
   * Fails **closed** in both cases: any read error throws
   * InventoryUnavailableException (mapped to HTTP 503 / INVENTORY_UNAVAILABLE by
   * the global filter) rather than reporting stock as unavailable. It is up to
   * the caller/UI to decide what to render on that error. Article numbers with
   * no stock still resolve to `available: false` — that is not an error.
   *
   * TODO(inventory-brand-scope): key this on brand + number, as the catalog
   * already does. An article number is not unique in TecDoc, but
   * `public.autoparts` and `public.supplier_stock` are keyed by `tecdoc_number`
   * alone, so two suppliers filing one number collapse into a single row here —
   * meaning we can quote one part's price for another. Those tables are owned
   * by the Spring Boot backoffice, so the column has to be added there (and
   * backfilled from the supplier feeds) before this signature can change; needs
   * a cross-team ticket rather than a change in this repo.
   */
  async getAvailability(
    articleNumbers: string[],
  ): Promise<Map<string, ArticleInventoryDetailDto>> {
    const result = new Map<string, ArticleInventoryDetailDto>();
    if (articleNumbers.length === 0) {
      return result;
    }

    const offersByNumber = await this.loadOffersByNumber(articleNumbers);

    const now = new Date();
    for (const articleNumber of articleNumbers) {
      const offers = offersByNumber.get(articleNumber) ?? EMPTY_OFFERS;
      result.set(
        articleNumber,
        this.toInventoryDetail(
          this.select(offers),
          this.buildWarehouseAvailability(offers, now),
          now.toISOString(),
        ),
      );
    }

    return result;
  }

  /**
   * Resolves the offers for every requested number, toggling only the DB query
   * by input size — a single number takes the single-row read, many take the
   * batch read. Wraps both paths in one fail-closed guard: any read error
   * becomes InventoryUnavailableException.
   */
  private async loadOffersByNumber(
    articleNumbers: string[],
  ): Promise<Map<string, ResolvedOffers>> {
    try {
      return articleNumbers.length === 1
        ? await this.loadSingleOffers(articleNumbers[0])
        : await this.loadBulkOffers(articleNumbers);
    } catch (error) {
      this.logger.error(
        `Availability read failed for ${articleNumbers.length} article(s)`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InventoryUnavailableException();
    }
  }

  private async loadSingleOffers(
    articleNumber: string,
  ): Promise<Map<string, ResolvedOffers>> {
    const offers = await this.loadOffers(articleNumber);
    return new Map([[articleNumber, offers]]);
  }

  private async loadBulkOffers(
    articleNumbers: string[],
  ): Promise<Map<string, ResolvedOffers>> {
    const [ownByNumber, suppliersByNumber] = await Promise.all([
      this.ownStock.findByTecdocNumbers(articleNumbers),
      this.supplierStock.findByTecdocNumbers(articleNumbers),
    ]);

    const offersByNumber = new Map<string, ResolvedOffers>();
    for (const articleNumber of articleNumbers) {
      offersByNumber.set(
        articleNumber,
        this.toOffers(
          ownByNumber.get(articleNumber) ?? [],
          suppliersByNumber.get(articleNumber) ?? [],
        ),
      );
    }

    return offersByNumber;
  }

  private async loadOffers(articleNumber: string): Promise<ResolvedOffers> {
    const [ownRows, supplierRows] = await Promise.all([
      this.ownStock.findByTecdocNumber(articleNumber),
      this.supplierStock.findByTecdocNumber(articleNumber),
    ]);
    return this.toOffers(ownRows, supplierRows);
  }

  private toOffers(
    ownRows: OwnStockRow[],
    supplierRows: SupplierStockRow[],
  ): ResolvedOffers {
    return {
      own: this.toOwnOffer(ownRows),
      suppliers: this.toSupplierOffers(supplierRows),
    };
  }

  private select(offers: ResolvedOffers): BestOffer {
    return selectBestOffer(offers, { vatRate: this.vatRate });
  }

  /**
   * Groups all stock into the customer-facing warehouses (by inherent supplier
   * capability), unites the quantity per warehouse, and attaches the projected
   * pickup/courier delivery dates. Computed at request time, so callers must
   * only use it on dynamic (uncached) responses.
   */
  private buildWarehouseAvailability(
    offers: ResolvedOffers,
    now: Date = new Date(),
  ): WarehouseAvailabilityDto[] {
    const quantityByWarehouse = new Map<Warehouse, number>();

    if (offers.own && offers.own.quantity > 0) {
      addQuantity(
        quantityByWarehouse,
        warehouseForOwnStock(),
        offers.own.quantity,
      );
    }

    for (const supplier of offers.suppliers) {
      if (supplier.quantity <= 0) continue;
      addQuantity(
        quantityByWarehouse,
        warehouseForRule(supplier.rule),
        supplier.quantity,
      );
    }

    const warehouses: WarehouseAvailabilityDto[] = [];
    for (const warehouse of warehousesFastestFirst()) {
      const quantity = quantityByWarehouse.get(warehouse);
      if (!quantity) continue;

      const projection = this.deliverySchedule.projectWarehouse(warehouse, now);
      warehouses.push({
        warehouseId: warehouse,
        quantity,
        deliveryWorkDays: projection.deliveryWorkDays,
        orderCutoffTime: projection.orderCutoffTime,
        cutoffAt: projection.cutoffAt,
        pickup: projection.pickup,
        courier: projection.courier,
      });
    }

    return warehouses;
  }

  /**
   * Maps raw supplier rows to resolved offers, dropping anomalous lines so we
   * never show the customer invalid information:
   *  - an unknown/missing quantity (availability === null) is excluded;
   *  - an unknown supplier/warehouse (no delivery rule) is excluded by the
   *    resolver (which raises its own alert).
   * Both anomalies "should not happen" and are logged for monitoring.
   */
  private toSupplierOffers(rows: SupplierStockRow[]): SupplierOffer[] {
    const offers: SupplierOffer[] = [];

    for (const row of rows) {
      if (row.availability === null) {
        this.logger.error(
          `ALERT: missing quantity for supplier_stock ` +
            `${row.supplierSource}/${row.warehouseCode ?? '∅'} ` +
            `(tecdoc=${row.tecdocNumber}); dropping the offer.`,
        );
        continue;
      }

      const resolution = this.deliverySpeed.resolve(
        row.supplierSource,
        row.warehouseCode,
      );
      if (resolution === null) {
        continue;
      }

      offers.push({
        supplierSource: row.supplierSource,
        warehouseCode: row.warehouseCode,
        quantity: row.availability,
        buyPriceCents: row.buyPriceCents,
        sellPriceCents: row.sellPriceCents,
        rule: resolution.rule,
        delivery: resolution.outcome,
      });
    }

    return offers;
  }

  private toOwnOffer(rows: OwnStockRow[]): OwnOffer | null {
    if (rows.length === 0) {
      return null;
    }

    const quantity = rows.reduce((sum, row) => sum + row.availableQuantity, 0);
    const priced = rows.reduce((best, current) =>
      current.sellPriceIncVatCents < best.sellPriceIncVatCents ? current : best,
    );

    return {
      quantity,
      priceExVatCents: priced.sellPriceExVatCents,
      priceIncVatCents: priced.sellPriceIncVatCents,
    };
  }

  private toInventoryDetail(
    offer: BestOffer,
    availabilityByWarehouse: WarehouseAvailabilityDto[] = [],
    computedAt: string | null = null,
  ): ArticleInventoryDetailDto {
    return {
      available: offer.available,
      bestPriceExVat: offer.priceExVatCents,
      bestPriceIncVat: offer.priceIncVatCents,
      availabilityByWarehouse,
      computedAt,
    };
  }
}

function addQuantity(
  quantityByWarehouse: Map<Warehouse, number>,
  warehouse: Warehouse,
  quantity: number,
): void {
  quantityByWarehouse.set(
    warehouse,
    (quantityByWarehouse.get(warehouse) ?? 0) + quantity,
  );
}
