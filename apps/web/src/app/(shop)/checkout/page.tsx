import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout";

export const metadata: Metadata = {
  title: "Доставка и плащане — VP Parts",
  description: "Изберете как да получите поръчката си.",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <div className="page-container py-8">
      <CheckoutView />
    </div>
  );
}
