import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AvailabilityDto,
  DeliveryAvailabilityDto,
  StockStatus,
} from '@vp-parts-shop/shared';
import { AutopartsRepository, OwnStockRow } from './autoparts.repository';
import {
  SupplierStockRepository,
  SupplierStockRow,
} from './supplier-stock.repository';
import { DeliverySpeedResolver } from './delivery-speed.resolver';
import {
  BestOffer,
  OwnOffer,
  SupplierOffer,
  selectBestOffer,
} from './best-offer';
import { InventoryUnavailableException } from './inventory-unavailable.exception';
import { PriceAndAvailability } from './inventory.types';

const UNAVAILABLE: PriceAndAvailability = {
  available: false,
  priceExVat: null,
  priceIncVat: null,
  stockStatus: StockStatus.OUT_OF_STOCK,
  estimatedDeliveryDays: null,
  quantity: 0,
  availabilityByDelivery: [],
};

const DEFAULT_VAT_RATE = 0.2;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly vatRate: number;

  constructor(
    private readonly ownStock: AutopartsRepository,
    private readonly supplierStock: SupplierStockRepository,
    private readonly deliverySpeed: DeliverySpeedResolver,
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
    let offer: BestOffer;

    try {
      offer = await this.resolveOffer(articleNumber);
    } catch (error) {
      this.logger.error(
        `Live availability read failed for ${articleNumber}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InventoryUnavailableException();
    }

    return {
      articleNumber,
      available: offer.available,
      stockStatus: offer.stockStatus,
      estimatedDeliveryDays: offer.estimatedDeliveryDays,
      quantity: offer.quantity,
      priceExVat: offer.priceExVatCents,
      priceIncVat: offer.priceIncVatCents,
      availabilityByDelivery: toDeliveryAvailability(offer),
    };
  }

  /**
   * Best price & availability for the cached public catalog (listing + detail).
   * Browsing must never break on a database hiccup, so this path fails open:
   * any read error yields the neutral "unavailable" state instead of throwing.
   */
  async getBestPriceAndAvailability(
    articleNumber: string,
  ): Promise<PriceAndAvailability> {
    try {
      const offer = await this.resolveOffer(articleNumber);
      return this.toPriceAndAvailability(offer);
    } catch (error) {
      this.logger.warn(
        `Best price read failed for ${articleNumber}; serving unavailable`,
        error instanceof Error ? error.stack : String(error),
      );
      return { ...UNAVAILABLE };
    }
  }

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
        const offer = this.select(
          ownByNumber.get(articleNumber) ?? [],
          suppliersByNumber.get(articleNumber) ?? [],
        );
        result.set(articleNumber, this.toPriceAndAvailability(offer));
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

  private async resolveOffer(articleNumber: string): Promise<BestOffer> {
    const [ownRows, supplierRows] = await Promise.all([
      this.ownStock.findByTecdocNumber(articleNumber),
      this.supplierStock.findByTecdocNumber(articleNumber),
    ]);
    return this.select(ownRows, supplierRows);
  }

  private select(
    ownRows: OwnStockRow[],
    supplierRows: SupplierStockRow[],
  ): BestOffer {
    return selectBestOffer(
      {
        own: this.toOwnOffer(ownRows),
        suppliers: this.toSupplierOffers(supplierRows),
      },
      { vatRate: this.vatRate },
    );
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

      const delivery = this.deliverySpeed.resolve(
        row.supplierSource,
        row.warehouseCode,
      );
      if (delivery === null) {
        continue;
      }

      offers.push({
        supplierSource: row.supplierSource,
        warehouseCode: row.warehouseCode,
        quantity: row.availability,
        buyPriceCents: row.buyPriceCents,
        sellPriceCents: row.sellPriceCents,
        delivery,
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

  private toPriceAndAvailability(offer: BestOffer): PriceAndAvailability {
    return {
      available: offer.available,
      priceExVat: offer.priceExVatCents,
      priceIncVat: offer.priceIncVatCents,
      stockStatus: offer.stockStatus,
      estimatedDeliveryDays: offer.estimatedDeliveryDays,
      quantity: offer.quantity,
      availabilityByDelivery: toDeliveryAvailability(offer),
    };
  }
}

/** Strips the server-side per-supplier sources, leaving client-safe totals. */
function toDeliveryAvailability(offer: BestOffer): DeliveryAvailabilityDto[] {
  return offer.availabilityByDelivery.map((window) => ({
    stockStatus: window.stockStatus,
    estimatedDeliveryDays: window.estimatedDeliveryDays,
    quantity: window.quantity,
  }));
}
