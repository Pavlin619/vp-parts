"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppErrorCode, type OrderDetailDto } from "@vp-parts-shop/shared";
import { CheckoutSteps } from "@/components/cart";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import { orderQueryOptions } from "@/lib/api/orders";
import { OrderConfirmationHero } from "./order-confirmation-hero";
import { OrderConfirmationSkeleton } from "./order-confirmation-skeleton";
import { OrderDeliveryDetails } from "./order-delivery-details";
import { OrderLines } from "./order-lines";
import { OrderMoneySummary } from "./order-money-summary";

/** Someone else's order, or no order, reads the same: the API answers 404, never 403. */
const NOT_FOUND_CODES: readonly string[] = [
  AppErrorCode.ORDER_NOT_FOUND,
  AppErrorCode.NOT_FOUND,
  AppErrorCode.VALIDATION_ERROR,
];

/** The order as placed: what checkout lands on, and the link the customer keeps. */
export function OrderConfirmation({ orderReference }: { orderReference: string }) {
  const { data, error, isPending, refetch } = useQuery(orderQueryOptions(orderReference));

  if (isPending) {
    return <OrderConfirmationSkeleton />;
  }

  if (error) {
    return <OrderUnavailable error={error} onRetry={() => void refetch()} />;
  }

  return <PlacedOrder order={data} />;
}

function PlacedOrder({ order }: { order: OrderDetailDto }) {
  return (
    <>
      <CheckoutSteps current={3} />

      <div className="grid items-start gap-7 pb-16 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-3">
          <OrderConfirmationHero order={order} />
          <OrderDeliveryDetails order={order} />
          <OrderLines items={order.items} />
        </div>

        <aside className="xl:sticky xl:top-24">
          <OrderMoneySummary order={order} />
        </aside>
      </div>
    </>
  );
}

function OrderUnavailable({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (error instanceof ApiError && error.errorCode === AppErrorCode.UNAUTHORIZED) {
    return (
      <OrderNotice
        title="Влезте в профила си"
        message="Поръчката се вижда само от профила, от който е направена."
        href="/sign-in"
        action="Вход"
      />
    );
  }

  if (error instanceof ApiError && NOT_FOUND_CODES.includes(error.errorCode)) {
    return (
      <OrderNotice
        title="Поръчката не е намерена"
        message="Проверете връзката или влезте с профила, от който е направена."
        href="/"
        action="Към началото"
      />
    );
  }

  return <ErrorState message="В момента не можем да заредим поръчката." onRetry={onRetry} />;
}

function OrderNotice({
  title,
  message,
  href,
  action,
}: {
  title: string;
  message: string;
  href: string;
  action: string;
}) {
  return (
    <div className="rounded-[12px] border border-line bg-bg-card px-6 py-[72px] text-center">
      <p className="mb-1.5 text-base font-semibold text-ink">{title}</p>
      <p className="mb-5 text-[13px] text-ink-3">{message}</p>
      <Link href={href} className={buttonVariants({ size: "lg" })}>
        {action}
      </Link>
    </div>
  );
}
