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

/**
 * Stub implementation for Phase 3 (US1).
 * Full implementation is provided in Phase 5 (US3: T061).
 */
@Injectable()
export class InventoryService {
  getBestPriceAndAvailability(
    _articleNumber: string,
    _customerRole?: string,
  ): Promise<PriceAndAvailability> {
    return Promise.resolve({
      available: false,
      priceExVat: null,
      priceIncVat: null,
      stockStatus: 'UNKNOWN',
      estimatedDeliveryDays: null,
    });
  }
}
