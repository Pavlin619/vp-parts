import type { Metadata } from "next";
import { CartView } from "@/components/cart";

export const metadata: Metadata = {
  title: "Кошница — VP Parts",
  description: "Прегледайте избраните части и количествата, преди да поръчате.",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <div className="page-container py-8">
      <CartView />
    </div>
  );
}
