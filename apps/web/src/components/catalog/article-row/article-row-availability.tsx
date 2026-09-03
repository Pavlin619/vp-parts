"use client";

import { MapPin, Truck } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { ArticleInventoryDetailDto } from "@vp-parts-shop/shared";
import { WarehouseAvailabilityDialog } from "@/components/catalog/availability/warehouse-availability-dialog";
import { deliveryBand, summariseWarehouses } from "@/lib/delivery/availability";
import { DELIVERY_BAND, DELIVERY_BAND_LABEL } from "@/lib/delivery/bands";
import type { RowAvailability } from "@/lib/catalog/merge-availability";
import { cn } from "@/lib/utils";

interface ArticleRowAvailabilityProps {
  availability: RowAvailability;
  articleNumber: string;
  articleName: string;
  /** Selected line quantity — dims warehouses that can't fulfil it in the dialog. */
  quantity: number;
}

/**
 * The row's two live-inventory columns: the delivery promise and the stock
 * breakdown. Both come from the same separate availability read, so they share
 * its three states — pending (skeleton), failed (unknown) and resolved.
 *
 * The delivery label is the relative, hydration-safe one from
 * {@link DELIVERY_BAND_LABEL}: a list must not thread a live clock through
 * every row just to print a date.
 */
export function ArticleRowAvailability({
  availability,
  articleNumber,
  articleName,
  quantity,
}: ArticleRowAvailabilityProps) {
  if (availability === undefined) {
    return <AvailabilitySkeleton />;
  }

  if (availability === null) {
    return <AvailabilityUnknown />;
  }

  return (
    <AvailabilityCells
      availability={availability}
      articleNumber={articleNumber}
      articleName={articleName}
      quantity={quantity}
    />
  );
}

function AvailabilityCells({
  availability,
  articleNumber,
  articleName,
  quantity,
}: {
  availability: ArticleInventoryDetailDto;
  articleNumber: string;
  articleName: string;
  quantity: number;
}) {
  // Memoised because a list re-renders every row whenever anything above it
  // changes, and the rollup is the only real work a row does.
  const { warehouses, totalQuantity } = useMemo(
    () => summariseWarehouses(availability.availabilityByWarehouse),
    [availability.availabilityByWarehouse],
  );
  const fastest = warehouses[0];

  if (!availability.available) {
    return (
      <>
        <RowCell title="Доставка">
          <DeliveryChip className="bg-danger/10 text-danger">
            няма налично
          </DeliveryChip>
        </RowCell>

        <RowCell title="Наличност">
          <StockHeadline dotClassName="bg-danger" headline="Под поръчка" />
        </RowCell>
      </>
    );
  }

  // Purchasable but with no per-warehouse breakdown (a summary-only payload).
  // It is genuinely in stock, so no red chip — but the payload says nothing
  // about how fast it ships, and a delivery band here would promise a date we
  // have no data for.
  if (!fastest) {
    return (
      <>
        <RowCell title="Доставка">
          <DeliveryChip className="bg-bg-sunken text-ink-2">
            в наличност
          </DeliveryChip>
        </RowCell>

        <RowCell title="Наличност">
          <StockHeadline dotClassName="bg-ink-3" headline="Наличен в склад" />
        </RowCell>
      </>
    );
  }

  const band = deliveryBand(fastest);
  const tone = DELIVERY_BAND[band];
  const otherStock = totalQuantity - fastest.quantity;

  return (
    <>
      <RowCell title="Доставка">
        <DeliveryChip className={cn(tone.soft, tone.text)}>
          <Truck className="h-3 w-3" aria-hidden="true" />
          {DELIVERY_BAND_LABEL[band]}
        </DeliveryChip>
      </RowCell>

      <RowCell title="Наличност">
        <StockHeadline
          dotClassName={tone.dot}
          headline={`${fastest.quantity} бр.`}
          detail={fastest.name}
        />

        <WarehouseAvailabilityDialog
          warehouses={warehouses}
          quantity={quantity}
          subtitle={`${articleName} · ${articleNumber}`}
          triggerClassName="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent-hover"
          trigger={
            <>
              <MapPin className="h-3 w-3 text-accent" aria-hidden="true" />
              Складове
              {otherStock > 0 && ` +${otherStock} бр.`}
            </>
          }
        />
      </RowCell>
    </>
  );
}

/** The delivery cell's badge; `className` carries the state's tone. */
function DeliveryChip({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-[5px] px-2 py-[5px] text-[11.5px] font-semibold leading-[1.2]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The stock cell's speed dot with its headline and optional warehouse name. */
function StockHeadline({
  dotClassName,
  headline,
  detail,
}: {
  dotClassName: string;
  headline: string;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-[7px]">
      <span
        className={cn("mt-[5px] h-2 w-2 shrink-0 rounded-full", dotClassName)}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-ink">{headline}</p>
        {detail && (
          <p className="mt-px truncate text-[10.5px] text-ink-3">{detail}</p>
        )}
      </div>
    </div>
  );
}

/** Placeholder cells while the separate availability read is in flight. */
function AvailabilitySkeleton() {
  return (
    <>
      <RowCell title="Доставка">
        <span
          data-testid="article-row-delivery-skeleton"
          className="block h-[26px] w-[92px] animate-pulse rounded-[5px] bg-bg-sunken"
          aria-hidden="true"
        />
      </RowCell>

      <RowCell title="Наличност">
        <span
          data-testid="article-row-stock-skeleton"
          className="block h-4 w-[70px] animate-pulse rounded bg-bg-sunken"
          aria-hidden="true"
        />
        <span
          className="mt-1.5 block h-3 w-[104px] animate-pulse rounded bg-bg-sunken"
          aria-hidden="true"
        />
      </RowCell>
    </>
  );
}

/**
 * Shown when the availability read failed. We deliberately do not fall back to
 * "out of stock" — a transient inventory outage must not read as a verdict on
 * the part.
 */
function AvailabilityUnknown() {
  return (
    <>
      <RowCell title="Доставка">
        <span className="text-[11.5px] text-ink-3">—</span>
      </RowCell>

      <RowCell title="Наличност">
        <span className="text-[11.5px] text-ink-3">Няма данни</span>
      </RowCell>
    </>
  );
}

/** One labelled column. */
function RowCell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-ink-4">
        {title}
      </p>
      {children}
    </div>
  );
}
