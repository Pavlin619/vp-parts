import { UtilityStrip } from "@/components/layout/utility-strip";
import { ShopHeader } from "@/components/layout/shop-header";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <UtilityStrip />
      <ShopHeader />
      <main>{children}</main>
    </div>
  );
}
