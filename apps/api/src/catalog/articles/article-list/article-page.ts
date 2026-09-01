import { PaginatedDto } from '@vp-parts-shop/shared';

/**
 * Slices one page out of a set that is already ordered and complete.
 *
 * Every list surface that ranks by availability pages here rather than at
 * TecDoc: a rank is only meaningful if it saw the whole set, so the set is read
 * whole, ordered, and then cut. `total` is the size of that set, so a client can
 * offer the rest.
 */
export function pageOf<TItem>(
  items: TItem[],
  page: number,
  pageSize: number,
): PaginatedDto<TItem> {
  const start = (page - 1) * pageSize;

  return {
    total: items.length,
    page,
    pageSize,
    items: items.slice(start, start + pageSize),
  };
}
