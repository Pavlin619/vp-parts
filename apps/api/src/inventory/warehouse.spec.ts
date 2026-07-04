import { DeliveryRule } from './delivery';
import {
  OrderCutoffKind,
  Warehouse,
  WAREHOUSE_META,
  warehouseForOwnStock,
  warehouseForRule,
  warehousesFastestFirst,
} from './warehouse';

describe('warehouse model', () => {
  it('maps own stock to the central warehouse', () => {
    expect(warehouseForOwnStock()).toBe(Warehouse.CENTRAL);
  });

  it('maps each inherent delivery rule to a single warehouse', () => {
    expect(warehouseForRule(DeliveryRule.WITHIN_HOUR)).toBe(Warehouse.CENTRAL);
    expect(warehouseForRule(DeliveryRule.SAME_DAY_BEFORE_CUTOFF)).toBe(
      Warehouse.REGIONAL_1,
    );
    expect(warehouseForRule(DeliveryRule.NEXT_DAY)).toBe(Warehouse.REGIONAL_2);
    expect(warehouseForRule(DeliveryRule.TWO_BUSINESS_DAYS)).toBe(
      Warehouse.ROMANIA,
    );
    expect(warehouseForRule(DeliveryRule.THREE_BUSINESS_DAYS)).toBe(
      Warehouse.POLAND,
    );
  });

  it('groups same-day suppliers (Intercars B01, AutoPlus central) into Regional 1', () => {
    // SAME_DAY_BEFORE_CUTOFF is what those warehouses resolve to in delivery.ts.
    expect(warehouseForRule(DeliveryRule.SAME_DAY_BEFORE_CUTOFF)).toBe(
      Warehouse.REGIONAL_1,
    );
  });

  it('exposes the work-day term and cutoff kind per warehouse', () => {
    expect(WAREHOUSE_META[Warehouse.CENTRAL]).toMatchObject({
      baseWorkDays: 0,
      cutoffKind: OrderCutoffKind.SHOP_CLOSE,
    });
    expect(WAREHOUSE_META[Warehouse.REGIONAL_1]).toMatchObject({
      baseWorkDays: 0,
      cutoffKind: OrderCutoffKind.SAME_DAY,
    });
    expect(WAREHOUSE_META[Warehouse.REGIONAL_2]).toMatchObject({
      baseWorkDays: 1,
      cutoffKind: OrderCutoffKind.PROCESSING,
    });
    expect(WAREHOUSE_META[Warehouse.ROMANIA]).toMatchObject({
      baseWorkDays: 2,
      cutoffKind: OrderCutoffKind.PROCESSING,
    });
    expect(WAREHOUSE_META[Warehouse.POLAND]).toMatchObject({
      baseWorkDays: 3,
      cutoffKind: OrderCutoffKind.PROCESSING,
    });
  });

  it('orders warehouses fastest-first', () => {
    expect(warehousesFastestFirst()).toEqual([
      Warehouse.CENTRAL,
      Warehouse.REGIONAL_1,
      Warehouse.REGIONAL_2,
      Warehouse.ROMANIA,
      Warehouse.POLAND,
    ]);
  });
});
