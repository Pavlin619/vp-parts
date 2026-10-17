import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from '../common';

/**
 * Thrown when a price/availability read against the shared database cannot
 * complete, for a batch of any size — the single-number buy-box read included.
 * Maps to HTTP 503 with errorCode INVENTORY_UNAVAILABLE.
 *
 * Every availability surface fails **closed** for the same reason: `available:
 * false` is a legitimate answer meaning "we checked, there is no stock", so
 * reusing it for "we could not check" would quietly turn an outage into a
 * catalogue of out-of-stock parts. Throwing instead lets each surface render a
 * distinguishable "try again" state (`AvailabilityLoadError` on the web side)
 * over whatever metadata it already has.
 */
export class InventoryUnavailableException extends AppHttpException {
  constructor() {
    super(HttpStatus.SERVICE_UNAVAILABLE, AppErrorCode.INVENTORY_UNAVAILABLE);
  }
}
