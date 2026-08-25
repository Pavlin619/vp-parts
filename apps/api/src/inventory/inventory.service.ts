import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArticleIdentityDto,
  ArticleInventoryDetailDto,
  WarehouseAvailabilityDto,
  articleIdentityKey,
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

/** The stock lines both tables hold, keyed by {@link articleIdentityKey}. */
interface StockByArticle {
  own: Map<string, OwnStockRow[]>;
  suppliers: Map<string, SupplierStockRow[]>;
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
   * Live price & availability for one or many articles, keyed by
   * {@link articleIdentityKey}.
   *
   * This is the single availability read behind every surface — the buy box,
   * listing grid, search, substitutes, and the checkout re-check. It toggles
   * only the DB query by input size: one article takes the single-row read, many
   * take the batch read. Every entry then runs the same offer selection and
   * per-warehouse projection, so the request-time delivery dates are always
   * attached (the detail/list surfaces are dynamic, never cached).
   *
   * Articles are identified by brand *and* number, the way TecDoc identifies
   * them, and the repositories match on both. Two brands filing one number
   * therefore get one answer each, rather than each other's price.
   *
   * Fails **closed** in both cases: any read error throws
   * InventoryUnavailableException (mapped to HTTP 503 / INVENTORY_UNAVAILABLE by
   * the global filter) rather than reporting stock as unavailable. It is up to
   * the caller/UI to decide what to render on that error. Articles with no stock
   * still resolve to `available: false` — that is not an error.
   *
   * TODO(inventory-oe-parts): reach the original parts too. 70,677 stock lines
   * are filed under an internal OE code (`A1080`) instead of a TecDoc
   * data-supplier id, covering 65,314 numbers no aftermarket article carries, so
   * matching on the identity leaves them unreachable — as number-only matching
   * effectively did too, by quoting them for whichever aftermarket part shared a
   * number. They are a separate relation ("the original this replaces") and need
   * their own lookup, off the `oemNumbers` an aftermarket article already
   * carries, rendered as a distinct offer rather than blended into this one.
   */
  async getAvailability(
    articles: ArticleIdentityDto[],
  ): Promise<Map<string, ArticleInventoryDetailDto>> {
    const result = new Map<string, ArticleInventoryDetailDto>();
    if (articles.length === 0) {
      return result;
    }

    const offersByArticle = await this.loadOffersByArticle(articles);

    const now = new Date();
    for (const article of articles) {
      const key = articleIdentityKey(article.brandId, article.articleNumber);
      const offers = offersByArticle.get(key) ?? EMPTY_OFFERS;
      result.set(
        key,
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
   * Resolves the offers for every requested article, toggling only the DB query
   * by input size — a single article takes the single-row read, many take the
   * batch read. Wraps both paths in one fail-closed guard: any read error
   * becomes InventoryUnavailableException.
   */
  private async loadOffersByArticle(
    articles: ArticleIdentityDto[],
  ): Promise<Map<string, ResolvedOffers>> {
    const wanted = uniqueArticles(articles);

    try {
      const stock =
        wanted.length === 1
          ? await this.readSingle(wanted[0])
          : await this.readBatch(wanted);

      return this.toOffersByArticle(stock);
    } catch (error) {
      this.logger.error(
        `Availability read failed for ${articles.length} article(s)`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InventoryUnavailableException();
    }
  }

  private async readSingle(
    article: ArticleIdentityDto,
  ): Promise<StockByArticle> {
    const [ownRows, supplierRows] = await Promise.all([
      this.ownStock.findByArticle(article),
      this.supplierStock.findByArticle(article),
    ]);

    const key = articleIdentityKey(article.brandId, article.articleNumber);

    return {
      own: new Map([[key, ownRows]]),
      suppliers: new Map([[key, supplierRows]]),
    };
  }

  private async readBatch(
    articles: ArticleIdentityDto[],
  ): Promise<StockByArticle> {
    const [own, suppliers] = await Promise.all([
      this.ownStock.findByArticles(articles),
      this.supplierStock.findByArticles(articles),
    ]);

    return { own, suppliers };
  }

  private toOffersByArticle(
    stock: StockByArticle,
  ): Map<string, ResolvedOffers> {
    const offersByArticle = new Map<string, ResolvedOffers>();

    const stocked = new Set([...stock.own.keys(), ...stock.suppliers.keys()]);
    for (const key of stocked) {
      offersByArticle.set(
        key,
        this.toOffers(stock.own.get(key) ?? [], stock.suppliers.get(key) ?? []),
      );
    }

    return offersByArticle;
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
            `(tecdoc=${row.brandId}:${row.tecdocNumber}); dropping the offer.`,
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

/** One entry per identity, so a repeated article costs no extra index lookup. */
function uniqueArticles(articles: ArticleIdentityDto[]): ArticleIdentityDto[] {
  const byKey = new Map<string, ArticleIdentityDto>();
  for (const article of articles) {
    byKey.set(
      articleIdentityKey(article.brandId, article.articleNumber),
      article,
    );
  }

  return [...byKey.values()];
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
