export default function SearchLoading() {
  return (
    <div className="page-container py-8">
      <div className="mb-6 h-4 w-72 animate-pulse rounded bg-bg-sunken" />

      <div className="grid items-start gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
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
