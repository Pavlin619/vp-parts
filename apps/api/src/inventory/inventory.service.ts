import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AvailabilityDto,
  StockStatus,
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
import { PriceAndAvailability } from './inventory.types';

const UNAVAILABLE: PriceAndAvailability = {
  available: false,
  priceExVat: null,
  priceIncVat: null,
  stockStatus: StockStatus.OUT_OF_STOCK,
  estimatedDeliveryDays: null,
  availabilityByWarehouse: [],
  computedAt: null,
};

const DEFAULT_VAT_RATE = 0.2;

/** Resolved offers for a single article, ready for both selection paths. */
interface ResolvedOffers {
  own: OwnOffer | null;
  suppliers: SupplierOffer[];
}

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
   * Live, uncached availability for a single article. Reads our own stock and
   * supplier stock directly and fails closed (InventoryUnavailableException) on
   * a database error — this powers the protected availability endpoint, cart
   * refresh, and pre-checkout validation, all of which must never sell stale.
   */
  async getAvailability(articleNumber: string): Promise<AvailabilityDto> {
    let offers: ResolvedOffers;

    try {
      offers = await this.loadOffers(articleNumber);
    } catch (error) {
      this.logger.error(
        `Live availability read failed for ${articleNumber}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InventoryUnavailableException();
    }

    const now = new Date();
    const offer = this.select(offers);
    const availabilityByWarehouse = this.buildWarehouseAvailability(
      offers,
      now,
    );

    return {
      articleNumber,
      available: offer.available,
      stockStatus: offer.stockStatus,
      estimatedDeliveryDays: offer.estimatedDeliveryDays,
      priceExVat: offer.priceExVatCents,
      priceIncVat: offer.priceIncVatCents,
      availabilityByWarehouse,
      computedAt: now.toISOString(),
    };
  }

  /**
   * Best price & availability for the cached public catalog (listing + detail).
   * Browsing must never break on a database hiccup, so this path fails open:
   * any read error yields the neutral "unavailable" state instead of throwing.
   * The article detail page is rendered dynamically, so it is safe to embed the
   * absolute, request-time warehouse delivery dates here.
   */
  async getBestPriceAndAvailability(
    articleNumber: string,
  ): Promise<PriceAndAvailability> {
    try {
      const now = new Date();
      const offers = await this.loadOffers(articleNumber);
      const offer = this.select(offers);
      const availabilityByWarehouse = this.buildWarehouseAvailability(
        offers,
        now,
      );
      return this.toPriceAndAvailability(
        offer,
        availabilityByWarehouse,
        now.toISOString(),
      );
    } catch (error) {
      this.logger.warn(
        `Best price read failed for ${articleNumber}; serving unavailable`,
        error instanceof Error ? error.stack : String(error),
      );
      return { ...UNAVAILABLE };
    }
  }

  /**
   * Bulk price & availability for cached listing grids. Delivery dates are
   * intentionally omitted (availabilityByWarehouse stays empty): listings are
   * cached, so embedding absolute, request-time dates would serve stale promises.
   */
  async getBulkPricesAndAvailability(
    articleNumbers: string[],
  ): Promise<Map<string, PriceAndAvailability>> {
    const result = new Map<string, PriceAndAvailability>();
    if (articleNumbers.length === 0) {
      return result;
    }

    try {
      const [ownByNumber, suppliersByNumber] = await Promise.all([
        this.ownStock.findByTecdocNumbers(articleNumbers),
        this.supplierStock.findByTecdocNumbers(articleNumbers),
      ]);

      for (const articleNumber of articleNumbers) {
        const offers = this.toOffers(
          ownByNumber.get(articleNumber) ?? [],
          suppliersByNumber.get(articleNumber) ?? [],
        );
        result.set(
          articleNumber,
          this.toPriceAndAvailability(this.select(offers)),
        );
      }
    } catch (error) {
      this.logger.warn(
        'Bulk price read failed; serving unavailable for all requested articles',
        error instanceof Error ? error.stack : String(error),
      );
      for (const articleNumber of articleNumbers) {
        result.set(articleNumber, { ...UNAVAILABLE });
      }
    }

    return result;
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

  private toPriceAndAvailability(
    offer: BestOffer,
    availabilityByWarehouse: WarehouseAvailabilityDto[] = [],
    computedAt: string | null = null,
  ): PriceAndAvailability {
    return {
      available: offer.available,
      priceExVat: offer.priceExVatCents,
      priceIncVat: offer.priceIncVatCents,
      stockStatus: offer.stockStatus,
      estimatedDeliveryDays: offer.estimatedDeliveryDays,
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
