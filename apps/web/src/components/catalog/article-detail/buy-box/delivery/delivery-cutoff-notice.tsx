"use client";

import { Clock } from "lucide-react";
import type { WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { describeCutoffCountdown } from "@/lib/delivery/cutoff";
import { formatDay } from "@/lib/delivery/format";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

interface DeliveryCutoffNoticeProps {
  warehouse: WarehouseAvailabilityDto;
}

/**
 * Live countdown to the selected warehouse's order cut-off, shown only when it
 * is actionable: the cut-off is today (shop timezone) and within the show window
 * (see describeCutoffCountdown). This keeps it hidden when the shop is closed and
 * the deadline has rolled to a later day — no false "order in 23 h" urgency.
 *
 * Ordering before the cut-off keeps the delivery date shown above; the progress
 * bar shrinks as the deadline nears and turns to a warning tone in the final
 * stretch. Ticks (via useNow) so the remaining time stays fresh, and disappears
 * once the cut-off passes — the page re-validates then through useDeliveryRefresh.
 */
export function DeliveryCutoffNotice({ warehouse }: DeliveryCutoffNoticeProps) {
  const now = useNow();

  // `now` is null until the client mounts; the countdown is a live-only element,
  // so we render nothing server-side rather than emit a timestamp the client
  // cannot reproduce at hydration.
  if (!now) {
    return null;
  }

  const countdown = describeCutoffCountdown(warehouse, now);
  if (!countdown) {
    return null;
  }

  // Anchor the countdown to the outcome it buys — "order by 11:00 for delivery
  // today" — so the urgency is meaningful rather than a bare timer.
  const deliveryDay = formatDay(warehouse.pickup.earliestAt, now);

  return (
    <div
      data-testid="delivery-cutoff-notice"
      className="rounded-md bg-bg-sunken px-3 py-2.5"
    >
      <p className="flex items-center gap-2 text-[13px] text-ink-2">
        <Clock className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        <span>
          Поръчай до <b className="font-semibold text-ink">{countdown.orderCutoffTime} ч.</b>
          {" за доставка "}
          <b className="font-semibold text-ink">{deliveryDay}</b>
          {" · остават "}
          <b
            className={cn(
              "font-semibold tabular-nums",
              countdown.isUrgent ? "text-warn" : "text-accent-hover",
            )}
          >
            {formatRemaining(countdown.minutesRemaining)}
          </b>
        </span>
      </p>

      <div className="mt-2 h-1 overflow-hidden rounded bg-line">
        <span
          className={cn(
            "block h-full rounded transition-[width] duration-500",
            countdown.isUrgent ? "bg-warn" : "bg-accent",
          )}
          style={{ width: `${countdown.fraction * 100}%` }}
        />
      </div>
    </div>
  );
}

function formatRemaining(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}
