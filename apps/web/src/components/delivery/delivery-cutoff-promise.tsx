"use client";

import { Truck } from "lucide-react";
import { useNow } from "@/hooks/use-now";
import { describeCutoffCountdown } from "@/lib/delivery/cutoff";
import { formatDay } from "@/lib/delivery/format";
import type { DeliveryPromise } from "@/lib/delivery/promise";
import { cn } from "@/lib/utils";

/** Seconds are the nudge — a minute-grained timer reads as an estimate. */
const TICK_MS = 1_000;

interface DeliveryCutoffPromiseProps {
  /** The deadline being raced; null whenever there is none worth showing. */
  promise: DeliveryPromise | null;
  /** A line under the headline, for what the promise alone cannot say. */
  note?: string;
  className?: string;
}

/**
 * The order-now nudge: the day the customer gets the goods, phrased as the
 * question ordering answers, and the live countdown to the deadline that buys
 * it.
 *
 * Shared by the buy box and the cart summary so a deadline can never read one
 * way beside a part and another way beside the basket holding it. What differs
 * between them is only which promise they resolve — one line's warehouse, or
 * the binding one across a basket (`resolveOrderPromise`).
 *
 * It hides itself whenever the deadline is not actionable — beyond the show
 * window, on another day, or already passed (see `describeCutoffCountdown`) —
 * so it never manufactures urgency. The surface holding it re-reads
 * availability as the cut-off passes.
 */
export function DeliveryCutoffPromise({
  promise,
  note,
  className,
}: DeliveryCutoffPromiseProps) {
  // Null until the client mounts: a countdown has no server-side value that
  // would survive hydration.
  const now = useNow(TICK_MS);

  if (!promise || !now) {
    return null;
  }

  const countdown = describeCutoffCountdown(promise, now);
  if (!countdown) {
    return null;
  }

  const day = formatDay(promise.fulfilledAt, now);

  return (
    <div
      data-testid="delivery-cutoff-promise"
      className={cn("rounded-md bg-bg-sunken p-3", className)}
    >
      <p className="flex items-center gap-2 font-display text-sm font-semibold leading-tight text-ink">
        <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
        {promise.isPickup ? `Готова за вземане ${day}?` : `Да пристигне ${day}?`}
      </p>

      {note && <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-3">{note}</p>}

      <p className="mt-1 text-[12.5px] leading-[1.5] text-ink-3">
        Поръчайте в рамките на{" "}
        <b
          className={cn(
            "whitespace-nowrap font-semibold tabular-nums text-danger",
            countdown.isUrgent &&
              "underline decoration-[1.5px] underline-offset-2",
          )}
        >
          {formatRemaining(countdown.millisRemaining)}
        </b>
        {` · до ${countdown.orderCutoffTime} ч. от ${promise.warehouseName}`}
      </p>

      <div className="mt-2.5 h-1 overflow-hidden rounded bg-line-2">
        <span
          className={cn(
            "block h-full rounded transition-[width] duration-1000 ease-linear",
            countdown.isUrgent ? "bg-danger" : "bg-accent",
          )}
          style={{ width: `${countdown.fraction * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Seconds only once they matter — under an hour they are the urgency. */
function formatRemaining(millis: number): string {
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours >= 1) {
    return `${hours} ч ${minutes} мин`;
  }

  return `${minutes} мин ${totalSeconds % 60} сек`;
}
