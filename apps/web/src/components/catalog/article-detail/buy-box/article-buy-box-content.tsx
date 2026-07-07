"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { formatPrice, type WarehouseAvailabilityDto } from "@vp-parts-shop/shared";
import { Button } from "@/components/ui/button";
import { useBuyBoxQuantity } from "@/hooks/use-buy-box-quantity";
import { useLiveDeliveryClock } from "@/hooks/use-live-delivery-clock";
import { useFitVehicleName } from "@/hooks/use-fit-vehicle-name";
import { VehicleFitBadge } from "../vehicle-fit-badge";
import { ArticleAvailability } from "./availability/article-availability";
import { DeliveryEstimate } from "./delivery/delivery-estimate";
import { PriceBlock } from "./price-block";
import { UnavailableNotice } from "./unavailable-notice";

interface ArticleBuyBoxContentProps {
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
  /** Re-reads live availability when a cut-off passes / the tab refocuses stale. */
  onRefresh?: () => void;
  /** Wired to the cart store in US4. Optional until then. */
  onAddToCart?: (quantity: number) => void;
}

const NO_OP = () => {};

/**
 * Presentational buy box: price, vehicle fit, live availability, quantity
 * stepper and the delivery module. All the imperative concerns live in focused
 * hooks — the quantity/stock ceiling ({@link useBuyBoxQuantity}), the shared
 * live clock plus refresh wiring ({@link useLiveDeliveryClock}) and the
 * hydration-safe vehicle name ({@link useFitVehicleName}) — so this component
 * reads as a high-level layout of those pieces.
 */
export function ArticleBuyBoxContent({
  available,
  priceIncVat,
  priceExVat,
  fitsVehicle,
  vehicleName,
  articleNumber,
  articleName,
  availabilityByWarehouse = [],
  computedAt,
  onRefresh = NO_OP,
  onAddToCart,
}: ArticleBuyBoxContentProps) {
  const { selectedQuantity, maxQuantity, changeQuantity } =
    useBuyBoxQuantity(availabilityByWarehouse);
  const now = useLiveDeliveryClock(computedAt, availabilityByWarehouse, onRefresh);
  const fitVehicleName = useFitVehicleName(vehicleName);

  const displayPrice = priceIncVat;
  const hasPrice = displayPrice != null;

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
