import { Supplier } from '@vp-parts-shop/shared';

/**
 * How fast a specific supplier warehouse can deliver. These rules mirror the
 * warehouse enums in the backoffice (IntercarsWarehouse, AutoplusWarehouse,
 * Auto1Warehouse and the single AutoKomers warehouse) and are the source of
 * truth for our delivery expectations — there is no hardcoded per-supplier day
 * count anywhere else.
 */
export enum DeliveryRule {
  /** Local warehouse — can deliver within the hour. */
  WITHIN_HOUR = 'WITHIN_HOUR',
  /** Ordered before the daily cut-off → same day, otherwise the next day. */
  SAME_DAY_BEFORE_CUTOFF = 'SAME_DAY_BEFORE_CUTOFF',
  /** Next business day. */
  NEXT_DAY = 'NEXT_DAY',
  /** Within two business days. */
  TWO_BUSINESS_DAYS = 'TWO_BUSINESS_DAYS',
  /** Within three business days. */
  THREE_BUSINESS_DAYS = 'THREE_BUSINESS_DAYS',
}

/** Intercars warehouses (see backoffice IntercarsWarehouse). */
export const INTERCARS_WAREHOUSE_DELIVERY: Readonly<
  Record<string, DeliveryRule>
> = {
  B24: DeliveryRule.WITHIN_HOUR, // local to the business in Pleven
  B01: DeliveryRule.SAME_DAY_BEFORE_CUTOFF, // central warehouse, Sofia
  B02: DeliveryRule.SAME_DAY_BEFORE_CUTOFF, // central warehouse, Sofia
  HZA: DeliveryRule.TWO_BUSINESS_DAYS,
  R00: DeliveryRule.TWO_BUSINESS_DAYS, // Romania
  HSN: DeliveryRule.THREE_BUSINESS_DAYS,
};

/** AutoPlus warehouses (see backoffice AutoplusWarehouse). */
export const AUTOPLUS_WAREHOUSE_DELIVERY: Readonly<
  Record<string, DeliveryRule>
> = {
  CENTRALEN_SKLAD: DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
  MAGAZIN_PLEVEN: DeliveryRule.WITHIN_HOUR,
  MAGAZIN_LOVECH: DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
  MANIMPEX_OOD: DeliveryRule.SAME_DAY_BEFORE_CUTOFF,
};

/** AutoKomers ships from a single warehouse (see backoffice AutokomersStockFeed). */
export const AUTOKOMERS_WAREHOUSE_DELIVERY: Readonly<
  Record<string, DeliveryRule>
> = {
  CENTRAL: DeliveryRule.NEXT_DAY, // delivery within one day
};

/** Auto1 buckets (see backoffice Auto1Warehouse). */
export const AUTO1_WAREHOUSE_DELIVERY: Readonly<Record<string, DeliveryRule>> =
  {
    CENTRAL: DeliveryRule.NEXT_DAY, // ships within 24h
    REGIONAL: DeliveryRule.TWO_BUSINESS_DAYS, // ships within 48h
  };

export const SUPPLIER_WAREHOUSE_DELIVERY: Readonly<
  Record<Supplier, Readonly<Record<string, DeliveryRule>>>
> = {
  [Supplier.INTERCARS]: INTERCARS_WAREHOUSE_DELIVERY,
  [Supplier.AUTOPLUS]: AUTOPLUS_WAREHOUSE_DELIVERY,
  [Supplier.AUTOKOMERS]: AUTOKOMERS_WAREHOUSE_DELIVERY,
  [Supplier.AUTO1]: AUTO1_WAREHOUSE_DELIVERY,
};

/**
 * A resolved delivery expectation for one source. `rank` orders outcomes from
 * fastest (0, our own stock) to slowest, so the best-offer selector can pick
 * the fastest available source.
 */
export interface DeliveryOutcome {
  rank: number;
}

/** Our own stock is always the fastest option (ships immediately). */
export const OWN_STOCK_RANK = 0;

/**
 * Fastest-first speed rank per delivery rule (lower = faster). For
 * SAME_DAY_BEFORE_CUTOFF this is the before-cut-off rank; after the cut-off it
 * resolves to the NEXT_DAY rank (see {@link resolveDeliveryRule}).
 */
const DELIVERY_RULE_RANK: Record<DeliveryRule, number> = {
  [DeliveryRule.WITHIN_HOUR]: 1,
  [DeliveryRule.SAME_DAY_BEFORE_CUTOFF]: 2,
  [DeliveryRule.NEXT_DAY]: 3,
  [DeliveryRule.TWO_BUSINESS_DAYS]: 4,
  [DeliveryRule.THREE_BUSINESS_DAYS]: 5,
};

export const SOFIA_TIME_ZONE = 'Europe/Sofia';
/**
 * Orders placed before this local hour ship the same day. This is the default
 * for the band resolution below; the authoritative, config-driven cut-off lives
 * in {@link DeliveryScheduleService} (env `SAME_DAY_CUTOFF_HOUR`).
 */
export const SAME_DAY_CUTOFF_HOUR = 11;

/** The delivery-speed rank for a rule (its before-cut-off rank for same-day). */
export function rankForRule(rule: DeliveryRule): number {
  return DELIVERY_RULE_RANK[rule];
}

/** Our own stock is always the fastest option and ships immediately. */
export function ownStockOutcome(): DeliveryOutcome {
  return { rank: OWN_STOCK_RANK };
}

/**
 * Resolves a delivery rule to a concrete outcome. Only SAME_DAY_BEFORE_CUTOFF
 * depends on the clock: before the cut-off it delivers the same day, otherwise
 * it slips to the next-day rank.
 */
export function resolveDeliveryRule(
  rule: DeliveryRule,
  now: Date,
  cutoffHour: number = SAME_DAY_CUTOFF_HOUR,
  timeZone: string = SOFIA_TIME_ZONE,
): DeliveryOutcome {
  if (rule === DeliveryRule.SAME_DAY_BEFORE_CUTOFF) {
    const madeCutoff = localHour(now, timeZone) < cutoffHour;
    return {
      rank: madeCutoff
        ? DELIVERY_RULE_RANK[DeliveryRule.SAME_DAY_BEFORE_CUTOFF]
        : DELIVERY_RULE_RANK[DeliveryRule.NEXT_DAY],
    };
  }

  return { rank: DELIVERY_RULE_RANK[rule] };
}

/** Looks up the delivery rule for a supplier/warehouse, or null when unknown. */
export function lookupDeliveryRule(
  supplierSource: string,
  warehouseCode: string | null,
): DeliveryRule | null {
  const supplier = toSupplier(supplierSource);
  if (!supplier || !warehouseCode) {
    return null;
  }
  return SUPPLIER_WAREHOUSE_DELIVERY[supplier][warehouseCode] ?? null;
}

function toSupplier(supplierSource: string): Supplier | null {
  const key = supplierSource?.toUpperCase();
  return (Object.values(Supplier) as string[]).includes(key)
    ? (key as Supplier)
    : null;
}

function localHour(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return parseInt(hour, 10);
}
