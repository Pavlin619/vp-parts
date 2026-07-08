interface ArticleGridSkeletonProps {
  /** Number of placeholder cells, ideally the page's article count. */
  count?: number;
}

/**
 * Suspense fallback for the article grid while live availability streams in.
 * The cached metadata resolves instantly, so this only shows for the duration
 * of the live price/stock read.
 */
export function ArticleGridSkeleton({ count = 10 }: ArticleGridSkeletonProps) {
  return (
    <ul
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      aria-label="Зареждане на части"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <li
          key={index}
          className="bg-bg-sunken rounded-[12px] aspect-[3/4] animate-pulse"
        />
      ))}
    </ul>
  );
}
