import { OrderConfirmationSkeleton } from "@/components/orders";

export default function OrderLoading() {
  return (
    <div className="page-container py-8">
      <OrderConfirmationSkeleton />
    </div>
  );
}
