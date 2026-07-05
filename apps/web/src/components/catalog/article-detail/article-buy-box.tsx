"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { formatPrice, type WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import { summariseWarehouses } from "@/lib/delivery/availability";
import { useVehicleContext, useHydration } from "@/hooks/use-vehicle-context";
import { useDeliveryRefresh } from "@/hooks/use-delivery-refresh";
import { useNow } from "@/hooks/use-now";
import { ArticleAvailability } from "./article-availability";
import { DeliveryEstimate } from "./delivery-estimate";
import { VehicleFitBadge } from "./vehicle-fit-badge";

interface ArticleBuyBoxProps {
  available: boolean;
  priceIncVat: number | null;
  priceExVat: number | null;
  fitsVehicle: boolean | null;
  vehicleName?: string;
  /** Identifies the part in the by-warehouse dialog subtitle. */
  articleNumber?: string;
  articleName?: string;
  /** Available quantity per customer-facing warehouse, fastest first. */
  availabilityByWarehouse?: WarehouseAvailabilityDto[];
  /** When the warehouse delivery dates were computed (ISO UTC). */
  computedAt?: string | null;
  /** Wired to the cart store in US4. Optional until then. */
  onAddToCart?: (quantity: number) => void;
}

const MAX_QUANTITY = 99;

export function ArticleBuyBox({
  available,
  priceIncVat,
  priceExVat,
  fitsVehicle,
  vehicleName,
  articleNumber,
  articleName,
  availabilityByWarehouse = [],
  computedAt,
  onAddToCart,
}: ArticleBuyBoxProps) {
  const [quantity, setQuantity] = useState(1);

  const isHydrated = useHydration();
  const selectedVehicle = useVehicleContext((state) => state.selectedVehicle);

  // One clock for every time-derived label in the box. Before the client mounts
  // (and during SSR) `useNow` is null, so we fall back to the snapshot instant —
  // a value identical on the server and the first client render, which keeps the
  // delivery dates hydration-safe while still showing them immediately. After
  // mount the live clock takes over so staleness and countdowns stay honest.
  const liveNow = useNow();
  const now = liveNow ?? (computedAt ? new Date(computedAt) : null);

  // Keep the SSR delivery snapshot honest while the tab stays open: refresh the
  // dynamic page when an order cut-off passes or the tab regains focus stale.
  const cutoffAts = useMemo(
    () => availabilityByWarehouse.map((warehouse) => warehouse.cutoffAt),
    [availabilityByWarehouse],
  );
  useDeliveryRefresh(computedAt, cutoffAts);

  // Never let the customer order more than we can actually deliver. When the
  // backend sends no per-warehouse breakdown (neutral "available" state) we
  // can't know the stock, so fall back to the absolute UI ceiling.
  const { totalQuantity } = useMemo(
    () => summariseWarehouses(availabilityByWarehouse),
    [availabilityByWarehouse],
  );
  const maxQuantity =
    totalQuantity > 0 ? Math.min(totalQuantity, MAX_QUANTITY) : MAX_QUANTITY;

  // Derive the effective selection instead of storing an out-of-range value: a
  // re-validation (see useDeliveryRefresh) can shrink available stock below the
  // previously chosen quantity, and this keeps the shown/used amount deliverable
  // without an effect.
  const selectedQuantity = Math.min(quantity, maxQuantity);

  const displayPrice = priceIncVat;
  const hasPrice = displayPrice != null;

  // The article's fit verdict is server-driven; the vehicle *name* lives in the
  // client store, so only attach it after hydration to avoid a mismatch.
  const fitVehicleName =
    vehicleName ??
    (isHydrated && selectedVehicle
      ? `${selectedVehicle.manufacturerName} ${selectedVehicle.seriesName} · ${selectedVehicle.engine}`
      : undefined);

  function changeQuantity(delta: number) {
    setQuantity(Math.min(maxQuantity, Math.max(1, selectedQuantity + delta)));
  }

  return (
    <div className="flex flex-col gap-4 rounded-[12px] border border-line bg-bg-card p-5">
      {/* Show the price whenever we know it — even when the part is not
          currently deliverable — so a customer can still see what it costs. */}
      {hasPrice ? (
        <PriceBlock priceIncVat={displayPrice} priceExVat={priceExVat} />
      ) : (
        <p className="font-display text-3xl font-semibold text-muted">—</p>
      )}

      <VehicleFitBadge
        fitsVehicle={fitsVehicle}
        vehicleName={fitVehicleName}
        variant="box"
      />

      {available ? (
        <ArticleAvailability
          availabilityByWarehouse={availabilityByWarehouse}
          quantity={selectedQuantity}
          articleNumber={articleNumber}
          articleName={articleName}
          now={now}
        />
      ) : (
        <UnavailableNotice hasPrice={hasPrice} />
      )}

      {available && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Количество</span>
            <div className="flex items-center rounded-md border border-line">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => changeQuantity(-1)}
                disabled={selectedQuantity <= 1}
                aria-label="Намали количеството"
                className="h-10 w-10 rounded-l-md rounded-r-none text-ink"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span
                className="w-10 text-center font-display text-sm font-medium tabular-nums text-ink"
                aria-label="Количество"
              >
                {selectedQuantity}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => changeQuantity(1)}
                disabled={selectedQuantity >= maxQuantity}
                aria-label="Увеличи количеството"
                className="h-10 w-10 rounded-l-none rounded-r-md text-ink"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <Button
            type="button"
            size="lg"
            onClick={() => onAddToCart?.(selectedQuantity)}
            aria-label="Добави в кошницата"
            className="h-12 w-full gap-2 rounded-md text-sm font-semibold hover:bg-accent-hover"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            В кошница
            {displayPrice != null && (
              <span className="tabular-nums">· {formatPrice(displayPrice)}</span>
            )}
          </Button>

          <DeliveryEstimate
            availabilityByWarehouse={availabilityByWarehouse}
            quantity={selectedQuantity}
            computedAt={computedAt}
            now={now}
          />
        </>
      )}
    </div>
  );
}

/**
 * Shown when the part cannot be delivered. The delivery module and purchase
 * actions are hidden by the caller — we can't fulfil the order in either case.
 * The wording adapts to what we know: a part we normally carry but is out of
 * stock reads "Изчерпан"; a part we have no pricing/stock data for reads
 * "Не е наличен", since we can't claim it is merely sold out.
 */
function UnavailableNotice({ hasPrice }: { hasPrice: boolean }) {
  const label = hasPrice ? "Изчерпан" : "Не е наличен";

  return (
    <p
      className="flex items-center gap-2 text-sm font-medium text-danger"
      aria-label={label}
    >
      <span className="h-2 w-2 rounded-full bg-danger" aria-hidden="true" />
      {label}
    </p>
  );
}

function PriceBlock({
  priceIncVat,
  priceExVat,
}: {
  priceIncVat: number;
  priceExVat: number | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-display text-3xl font-semibold leading-none tabular-nums text-ink">
        {formatPrice(priceIncVat)}
      </p>

      <p className="text-xs text-muted">
        с ДДС
        {priceExVat != null && (
          <span className="tabular-nums">
            {" · без ДДС "}
            {formatPrice(priceExVat)}
          </span>
        )}
      </p>
    </div>
  );
}
