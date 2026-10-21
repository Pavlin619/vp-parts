import type { Metadata } from "next";
import { OrderConfirmation } from "@/components/orders";
import { decodeRouteParam } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Поръчка — VP Parts",
  robots: { index: false, follow: false },
};

interface OrderPageProps {
  params: Promise<{ orderReference: string }>;
}

/** Read in the browser: with the customer's session, or the key a guest's link carries. */
export default async function OrderPage({ params }: OrderPageProps) {
  const { orderReference } = await params;

  return (
    <div className="page-container py-8">
      <OrderConfirmation orderReference={decodeRouteParam(orderReference)} />
    </div>
  );
}
