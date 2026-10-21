/**
 * Web pages the API links to from its emails as well as the web itself. The
 * legal pages' content is the business's to write before launch —
 * docs/ORDERS.md → "Legal".
 */
export const LEGAL_PAGES = {
  terms: '/terms',
  withdrawal: '/withdrawal',
  privacy: '/privacy',
} as const;

/**
 * A guest's link carries the order's access key in the fragment, which the
 * browser never sends, so it reaches no server log and no `Referer`.
 */
export function orderPagePath(
  orderReference: string,
  accessKey?: string,
): string {
  const path = `/orders/${encodeURIComponent(orderReference)}`;

  return accessKey ? `${path}#k=${accessKey}` : path;
}
