export default function CategoryLoading() {
  return (
    <div className="page-container py-8">
      <div className="h-5 w-48 bg-bg-sunken rounded animate-pulse mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="bg-bg-sunken rounded-[12px] aspect-[3/4] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
