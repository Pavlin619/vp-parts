export default function SearchLoading() {
  return (
    <div className="max-w-[1360px] mx-auto px-6 py-8">
      <div className="h-7 w-64 bg-bg-sunken rounded animate-pulse mb-2" />
      <div className="h-4 w-32 bg-bg-sunken rounded animate-pulse mb-6" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-bg-sunken rounded-[12px] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
