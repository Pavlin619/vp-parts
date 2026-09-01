const priceFormatter = new Intl.NumberFormat('bg-BG', {
  style: 'currency',
  currency: 'EUR',
});

export function formatPrice(cents: number): string {
  return priceFormatter.format(cents / 100);
}

/**
 * Groups the thousands of a whole number with a non-breaking space, the
 * Bulgarian convention — so a five-figure match count can be read at a glance.
 *
 * Deliberately not `Intl.NumberFormat`. A count renders on the server and again
 * in the browser, and those two agree only if both runtimes carry the same ICU
 * data; one built without it groups nothing and React reports a hydration
 * mismatch. Three lines of arithmetic buy the guarantee.
 */
export function formatCount(value: number): string {
  return Math.trunc(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}
