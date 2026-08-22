export default function ArticleDetailLoading() {
  return (
    <div className="page-container py-8">
      <div className="mb-6 h-5 w-48 animate-pulse rounded bg-bg-sunken" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)_340px]">
        <div className="aspect-square w-full animate-pulse rounded-[12px] bg-bg-sunken" />
        <div className="flex flex-col gap-4">
          <div className="h-4 w-24 animate-pulse rounded bg-bg-sunken" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-bg-sunken" />
          <div className="h-4 w-40 animate-pulse rounded bg-bg-sunken" />
          <div className="mt-4 h-48 w-full animate-pulse rounded-[12px] bg-bg-sunken" />
        </div>
        <div className="h-72 w-full animate-pulse rounded-[12px] bg-bg-sunken" />
      </div>
    </div>
  );
}
