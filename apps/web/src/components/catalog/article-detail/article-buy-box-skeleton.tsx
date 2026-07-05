/**
 * Placeholder for the buy box while its live price/availability streams in.
 * Matches the buy box footprint so the sticky column does not shift on load.
 */
export function ArticleBuyBoxSkeleton() {
  return (
    <div
      className="h-72 w-full animate-pulse rounded-[12px] bg-bg-sunken"
      aria-hidden="true"
    />
  );
}
