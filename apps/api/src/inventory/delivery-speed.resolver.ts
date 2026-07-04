import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeliveryOutcome,
  DeliveryRule,
  SAME_DAY_CUTOFF_HOUR,
  SOFIA_TIME_ZONE,
  lookupDeliveryRule,
  resolveDeliveryRule,
} from './delivery';

/**
 * A resolved supplier line: its inherent delivery rule (used for the static
 * warehouse grouping) and the clock-resolved outcome (used for the
 * fastest-band selection that sets the headline offer).
 */
export interface DeliveryResolution {
  rule: DeliveryRule;
  outcome: DeliveryOutcome;
}

/**
 * Resolves how soon a supplier warehouse can deliver a part, as a concrete
 * {@link DeliveryOutcome}. The warehouse→rule mapping lives in `delivery.ts`
 * (mirroring the backoffice warehouse enums); this class only adds the runtime
 * clock so the same-day cut-off can be evaluated.
 *
 * The same-day cut-off hour and timezone are read from the same config keys as
 * {@link DeliveryScheduleService} (`SAME_DAY_CUTOFF_HOUR`, `SHOP_TIMEZONE`), so
 * the headline stock status and the per-warehouse delivery dates can never
 * disagree because of drifting configuration.
 *
 * Unknown supplier/warehouse combinations resolve to `null` (and raise an alert
 * log): we would rather drop such an offer and treat the part as out of stock
 * than show the customer an invented delivery promise. These cases should never
 * happen in practice, so they are logged at error level for monitoring.
 */
@Injectable()
export class DeliverySpeedResolver {
  private readonly logger = new Logger(DeliverySpeedResolver.name);
  private readonly cutoffHour: number;
  private readonly timeZone: string;

  constructor(config: ConfigService) {
    this.cutoffHour =
      config.get<number>('SAME_DAY_CUTOFF_HOUR') ?? SAME_DAY_CUTOFF_HOUR;
    this.timeZone = config.get<string>('SHOP_TIMEZONE') ?? SOFIA_TIME_ZONE;
  }

  resolve(
    supplierSource: string,
    warehouseCode: string | null,
    now: Date = new Date(),
  ): DeliveryResolution | null {
    const rule = lookupDeliveryRule(supplierSource, warehouseCode);

    if (!rule) {
      this.logger.error(
        `ALERT: unknown delivery mapping for supplier=${supplierSource} ` +
          `warehouse=${warehouseCode ?? '∅'}; dropping the offer (treated as out of stock).`,
      );
      return null;
    }

    return {
      rule,
      outcome: resolveDeliveryRule(rule, now, this.cutoffHour, this.timeZone),
    };
  }
}
