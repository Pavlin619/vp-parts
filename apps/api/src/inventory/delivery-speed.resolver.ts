import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryOutcome,
  lookupDeliveryRule,
  resolveDeliveryRule,
} from './delivery';

/**
 * Resolves how soon a supplier warehouse can deliver a part, as a concrete
 * {@link DeliveryOutcome}. The warehouse→rule mapping lives in `delivery.ts`
 * (mirroring the backoffice warehouse enums); this class only adds the runtime
 * clock so the same-day cut-off can be evaluated.
 *
 * Unknown supplier/warehouse combinations resolve to `null` (and raise an alert
 * log): we would rather drop such an offer and treat the part as out of stock
 * than show the customer an invented delivery promise. These cases should never
 * happen in practice, so they are logged at error level for monitoring.
 */
@Injectable()
export class DeliverySpeedResolver {
  private readonly logger = new Logger(DeliverySpeedResolver.name);

  resolve(
    supplierSource: string,
    warehouseCode: string | null,
    now: Date = new Date(),
  ): DeliveryOutcome | null {
    const rule = lookupDeliveryRule(supplierSource, warehouseCode);

    if (!rule) {
      this.logger.error(
        `ALERT: unknown delivery mapping for supplier=${supplierSource} ` +
          `warehouse=${warehouseCode ?? '∅'}; dropping the offer (treated as out of stock).`,
      );
      return null;
    }

    return resolveDeliveryRule(rule, now);
  }
}
