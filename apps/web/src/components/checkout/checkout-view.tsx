"use client";

import { useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { CartAvailabilityError, CartEmpty, CheckoutSteps } from "@/components/cart";
import { buttonVariants } from "@/components/ui/button";
import { useCartLines } from "@/hooks/use-cart";
import { useCartAvailability } from "@/hooks/use-cart-availability";
import { useCartStatus } from "@/hooks/use-cart-status";
import { resolveOrderPromise } from "@/lib/cart/cart-promise";
import { cartTotals } from "@/lib/cart/cart-totals";
import {
  DEFAULT_DELIVERY_METHOD,
  type DeliveryMethod,
} from "@/lib/checkout/delivery-methods";
import { DeliveryMethodPanel } from "./delivery-method-panel";
import { OrderItemsPanel } from "./order-items-panel";

/**
 * Checkout's second step: how the selected cart lines reach the customer.
 *
 * Every figure is read live, through the same read as the cart page.
 */
export function CheckoutView() {
  const status = useCartStatus();
  const lines = useCartLines();
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(
    DEFAULT_DELIVERY_METHOD,
  );

  const availability = useCartAvailability(lines);

  const rows = availability.rows.filter((row) => row.line.isSelected);
  const totals = cartTotals(rows);
  // Both B2C methods go by courier, so they race the same deadline.
  const promise = resolveOrderPromise(rows, "courier");

  return (
    <>
      <h1 className="mb-3.5 font-display text-[32px] font-semibold tracking-[-0.02em] text-ink">
        Доставка и плащане
      </h1>
      <CheckoutSteps current={2} />

      {status === "loading" && <CheckoutSkeleton />}

      {status === "empty" && <CartEmpty />}

      {status === "ready" && rows.length === 0 && <NothingSelected />}

      {status === "ready" && rows.length > 0 && (
        <>
          {availability.isError && (
            <CartAvailabilityError
              hasPrices={availability.hasPrices}
              unloadedTitle="В момента не можем да заредим цените и наличностите на поръчката."
              onRetry={availability.refetch}
            />
          )}

          {totals.hasBlockedLines && <BlockedLinesNotice />}

          <div className="grid items-start gap-7 pb-16 xl:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex min-w-0 flex-col gap-3">
              <DeliveryMethodPanel
                method={deliveryMethod}
                onMethodChange={setDeliveryMethod}
                promise={promise}
              />
            </div>

            <aside className="xl:sticky xl:top-24">
              <OrderItemsPanel rows={rows} itemCount={totals.itemCount} />
            </aside>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Reachable by a direct link or the back button: the cart's own button stays
 * disabled while a selected line cannot be ordered.
 */
function BlockedLinesNotice() {
  return (
    <p className="mb-6 flex items-start gap-[7px] rounded-[12px] border border-line bg-bg-sunken px-4 py-3 text-[12.5px] leading-[1.45] text-danger">
      <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Някои от избраните артикули не могат да бъдат поръчани в това количество.{" "}
        <Link href="/cart" className="font-semibold underline underline-offset-2">
          Прегледайте кошницата
        </Link>
      </span>
    </p>
  );
}

function NothingSelected() {
  return (
    <div className="rounded-[12px] border border-line bg-bg-card px-6 py-[72px] text-center">
      <p className="mb-1.5 text-base font-semibold text-ink">Няма избрани артикули</p>
      <p className="mb-5 text-[13px] text-ink-3">
        Изберете поне един артикул в кошницата, за да продължите.
      </p>
      <Link href="/cart" className={buttonVariants({ size: "lg" })}>
        Към кошницата
      </Link>
    </div>
  );
}

/** Stands in until the persisted cart has been read — see `CartView`. */
function CheckoutSkeleton() {
  return (
    <div
      data-testid="checkout-skeleton"
      aria-hidden="true"
      className="grid items-start gap-7 pb-16 xl:grid-cols-[minmax(0,1fr)_400px]"
    >
      <span className="block h-[240px] animate-pulse rounded-[12px] bg-bg-sunken" />
      <span className="block h-[200px] animate-pulse rounded-[12px] bg-bg-sunken" />
    </div>
  );
}
