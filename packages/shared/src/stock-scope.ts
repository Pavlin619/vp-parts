import type { WarehouseAvailabilityDto, WarehouseId } from './dto/inventory.dto';

/**
 * Where the stock behind a listed part sits, as the two origins a customer
 * picks between: `central` is our own shelf, `external` is everything a
 * supplier holds for us.
 *
 * These are two predicates over one article, not a partition of a result set.
 * A number we stock and a supplier also stocks satisfies both, so the counts
 * overlap and do not sum to the total — anything presenting them as segments of
 * a whole is presenting a number that does not add up.
 */
export type StockScope = 'central' | 'external';

export const STOCK_SCOPES: readonly StockScope[] = ['central', 'external'];

export function isStockScope(value: unknown): value is StockScope {
  return STOCK_SCOPES.includes(value as StockScope);
}

/**
 * `CENTRAL` is the only warehouse we hold ourselves; the rest are supplier
 * stock grouped by delivery capability, which is why the split is against one
 * id rather than a list that has to be extended with every new warehouse.
 */
export function stockScopeOf(warehouseId: WarehouseId): StockScope {
  return warehouseId === 'CENTRAL' ? 'central' : 'external';
}

/**
 * Whether an origin actually holds the part. Zero-quantity warehouses do not
 * count: the ordering ranks and the row badges on stocked lines only, so a
 * scope read off an empty line would offer a filter listing parts nobody can
 * ship.
 */
export function hasStockInScope(
  scope: StockScope,
  warehouses: readonly WarehouseAvailabilityDto[],
): boolean {
  return warehouses.some(
    (warehouse) =>
      warehouse.quantity > 0 && stockScopeOf(warehouse.warehouseId) === scope,
  );
}

/**
 * Every origin that can ship the part, as the two bits worth carrying alongside
 * a ranked article once its stock has been read.
 *
 * An empty list means no origin holds it, which is a real answer. "Stock was
 * never read" has to be a missing list rather than an empty one — a filter
 * cannot be offered over the second and would exclude everything if it were.
 */
export function stockScopesOf(
  warehouses: readonly WarehouseAvailabilityDto[],
): StockScope[] {
  return STOCK_SCOPES.filter((scope) => hasStockInScope(scope, warehouses));
}
