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

export function orderPagePath(orderReference: string): string {
  return `/orders/${encodeURIComponent(orderReference)}`;
}
