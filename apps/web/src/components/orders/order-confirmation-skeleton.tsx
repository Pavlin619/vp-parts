/** Stands in while the order is read: the route's loading state and the page's own. */
export function OrderConfirmationSkeleton() {
  return (
    <div data-testid="order-confirmation-skeleton" aria-hidden="true">
      <div className="mb-6 h-[22px] w-80 animate-pulse rounded bg-bg-sunken" />
      <div className="grid items-start gap-7 pb-16 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-3">
          <span className="block h-[220px] animate-pulse rounded-[12px] bg-bg-sunken" />
          <span className="block h-[200px] animate-pulse rounded-[12px] bg-bg-sunken" />
        </div>
        <span className="block h-[260px] animate-pulse rounded-[12px] bg-bg-sunken" />
      </div>
    </div>
  );
}
