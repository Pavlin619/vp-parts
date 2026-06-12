import { Injectable } from '@nestjs/common';

export interface PriceAndAvailability {
  available: boolean;
  priceExVat: number | null;
  priceIncVat: number | null;
  stockStatus: string;
  estimatedDeliveryDays: number | null;
  tradePriceExVat?: number;
  tradePriceIncVat?: number;
}

const UNAVAILABLE: PriceAndAvailability = {
  available: false,
  priceExVat: null,
  priceIncVat: null,
  stockStatus: 'UNKNOWN',
  estimatedDeliveryDays: null,
};

/**
 * Stub implementation for Phase 3 (US1).
 * Full implementation is provided in Phase 5 (US3: T061).
 *
 * TODO: refine this when we have backoffice endpoint created
 */
@Injectable()
export class InventoryService {
  getBestPriceAndAvailability(
    _articleNumber: string,
    _customerRole?: string,
  ): Promise<PriceAndAvailability> {
    return Promise.resolve({ ...UNAVAILABLE });
  }

  getBulkPricesAndAvailability(
    articleNumbers: string[],
    _customerRole?: string,
  ): Promise<Map<string, PriceAndAvailability>> {
    const result = new Map<string, PriceAndAvailability>();
    for (const articleNumber of articleNumbers) {
      result.set(articleNumber, { ...UNAVAILABLE });
    }
    return Promise.resolve(result);
  }
}
