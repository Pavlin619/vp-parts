import type { Metadata } from "next";
import { OrderConfirmation } from "@/components/orders";
import { decodeRouteParam } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Поръчка — VP Parts",
  robots: { index: false, follow: false },
};

interface OrderPageProps {
  params: Promise<{ orderId: string }>;
}

/** Read in the browser with the customer's session; the API answers only its owner. */
export default async function OrderPage({ params }: OrderPageProps) {
  const { orderId } = await params;

  return (
    <div className="page-container py-8">
      <OrderConfirmation orderId={decodeRouteParam(orderId)} />
    </div>
  );
}
