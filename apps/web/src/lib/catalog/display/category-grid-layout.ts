/**
 * How the catalogue's category grid is laid out.
 *
 * The columns are counted in JavaScript rather than left to a media query
 * because a card expands into a panel that spans the whole grid, and the panel
 * belongs after the *row* the card sits in — which nothing but the column count
 * can identify. Measured against the grid's own width, not the viewport's, so
 * the page keeps working inside a narrower column.
 */
export const CATEGORY_GRID_MAX_COLUMNS = 4;

export function categoryGridColumns(width: number): number {
  if (width >= 1000) {
    return CATEGORY_GRID_MAX_COLUMNS;
  }

  return width >= 680 ? 3 : 2;
}

export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  const perRow = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];

  for (let start = 0; start < items.length; start += perRow) {
    rows.push(items.slice(start, start + perRow));
  }

  return rows;
}
