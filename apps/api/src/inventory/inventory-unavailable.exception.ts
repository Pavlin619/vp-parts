import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/**
 * Thrown when the live (no-store) price/availability read against the shared
 * database cannot complete. Maps to HTTP 503 with errorCode
 * INVENTORY_UNAVAILABLE so the frontend can block checkout rather than risk
 * selling at a stale price or out of stock. Browsing paths fail open instead.
 */
export class InventoryUnavailableException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: AppErrorCode.INVENTORY_UNAVAILABLE,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
