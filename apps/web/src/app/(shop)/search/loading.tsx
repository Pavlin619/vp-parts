export default function SearchLoading() {
  return (
    <div className="page-container py-8">
      <div className="mb-6 h-4 w-72 animate-pulse rounded bg-bg-sunken" />

      <div className="grid items-start gap-6 xl:grid-cols-[264px_minmax(0,1fr)]">
        {/* Mirrors the two shapes the filters take: a trigger below `xl`, the
            column of blocks above it. A skeleton of the column on a phone would
            promise 640px of sidebar that never arrives. */}
        <div className="h-11 animate-pulse rounded-md bg-bg-sunken xl:hidden" />

        <div className="hidden flex-col gap-2 xl:flex">
          {[180, 260, 200].map((height) => (
            <div
              key={height}
              className="animate-pulse rounded-md bg-bg-sunken"
              style={{ height }}
            />
          ))}
        </div>

        <div>
          <div className="mb-2 h-7 w-64 animate-pulse rounded bg-bg-sunken" />
          <div className="mb-6 h-4 w-32 animate-pulse rounded bg-bg-sunken" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-[12px] bg-bg-sunken"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
