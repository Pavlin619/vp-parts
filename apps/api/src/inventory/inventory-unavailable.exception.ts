import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/**
 * Thrown when a *bulk* price/availability read against the shared database
 * cannot complete. Maps to HTTP 503 with errorCode INVENTORY_UNAVAILABLE so a
 * list surface (catalog grid, search, substitutes) can show a single "try again
 * later" state instead of rendering every row as falsely out of stock. The
 * single-article read fails open instead (there is nothing else to show for one
 * buy box), so it never throws this.
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
