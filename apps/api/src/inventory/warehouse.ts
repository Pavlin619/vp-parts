import { DeliveryRule } from './delivery';

/**
 * Customer-facing fictional warehouses. We never expose the real suppliers; we
 * present their stock as if it lived in our own warehouse network. Each
 * warehouse is a STATIC grouping of supplier delivery bands by the supplier's
 * inherent capability (not the live clock), so e.g. Regional 1 always
 * represents same-day-capable stock even after the same-day cut-off has passed.
 */
export enum Warehouse {
  CENTRAL = 'CENTRAL',
  REGIONAL_1 = 'REGIONAL_1',
  REGIONAL_2 = 'REGIONAL_2',
  ROMANIA = 'ROMANIA',
  POLAND = 'POLAND',
}

/**
 * Which clock cut-off governs whether an order still makes today's dispatch for
 * a warehouse. The concrete hour comes from config (see DeliveryScheduleService)
 * because it is configurable and, for SHOP_CLOSE, depends on the day.
 */
export enum OrderCutoffKind {
  /** Bounded by the shop's closing time that day (18:00 weekdays, 14:00 Sat). */
  SHOP_CLOSE = 'SHOP_CLOSE',
  /** The early same-day cut-off (default 11:00). */
  SAME_DAY = 'SAME_DAY',
  /** The supplier processing cut-off for next-day-and-slower (default 17:00). */
  PROCESSING = 'PROCESSING',
}

export interface WarehouseMeta {
  /** Fastest-first ordering (0 = fastest). */
  rank: number;
  /** Nominal delivery term in working days, shown to the customer. */
  baseWorkDays: number;
  /** Which configurable cut-off applies to this warehouse. */
  cutoffKind: OrderCutoffKind;
}

export const WAREHOUSE_META: Readonly<Record<Warehouse, WarehouseMeta>> = {
  [Warehouse.CENTRAL]: {
    rank: 0,
    baseWorkDays: 0,
    cutoffKind: OrderCutoffKind.SHOP_CLOSE,
  },
  [Warehouse.REGIONAL_1]: {
    rank: 1,
    baseWorkDays: 0,
    cutoffKind: OrderCutoffKind.SAME_DAY,
  },
  [Warehouse.REGIONAL_2]: {
    rank: 2,
    baseWorkDays: 1,
    cutoffKind: OrderCutoffKind.PROCESSING,
  },
  [Warehouse.ROMANIA]: {
    rank: 3,
    baseWorkDays: 2,
    cutoffKind: OrderCutoffKind.PROCESSING,
  },
  [Warehouse.POLAND]: {
    rank: 4,
    baseWorkDays: 3,
    cutoffKind: OrderCutoffKind.PROCESSING,
  },
};

const WAREHOUSE_BY_RULE: Readonly<Record<DeliveryRule, Warehouse>> = {
  [DeliveryRule.WITHIN_HOUR]: Warehouse.CENTRAL,
  [DeliveryRule.SAME_DAY_BEFORE_CUTOFF]: Warehouse.REGIONAL_1,
  [DeliveryRule.NEXT_DAY]: Warehouse.REGIONAL_2,
  [DeliveryRule.TWO_BUSINESS_DAYS]: Warehouse.ROMANIA,
  [DeliveryRule.THREE_BUSINESS_DAYS]: Warehouse.POLAND,
};

/** Our own stock is always presented from the central warehouse. */
export function warehouseForOwnStock(): Warehouse {
  return Warehouse.CENTRAL;
}

/** The warehouse a supplier line belongs to, by its inherent delivery rule. */
export function warehouseForRule(rule: DeliveryRule): Warehouse {
  return WAREHOUSE_BY_RULE[rule];
}

/** Warehouses ordered fastest-first. */
export function warehousesFastestFirst(): Warehouse[] {
  return Object.values(Warehouse).sort(
    (a, b) => WAREHOUSE_META[a].rank - WAREHOUSE_META[b].rank,
  );
}
