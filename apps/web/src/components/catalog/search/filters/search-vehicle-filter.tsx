"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Car, CheckCircle2, Pencil, X } from "lucide-react";
import { formatCount } from "@vp-parts-shop/shared";
import { VehicleSelector } from "@/components/catalog/vehicle-selector";
import {
  useHydration,
  useVehicleContext,
  type SelectedVehicle,
} from "@/hooks/use-vehicle-context";
import {
  buildSearchUrl,
  withoutVehicle,
  withVehicle,
  type SearchUrlState,
} from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";

const CARD = "rounded-md border p-4";
const PLAIN_CARD = "border-line bg-bg-card";
const SCOPED_CARD = "border-brand/40 bg-brand-soft/60";
const TITLE =
  "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]";
const PRIMARY_BUTTON =
  "flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-semibold text-white transition-colors";
const GHOST_ACTION =
  "flex items-center gap-1 whitespace-nowrap text-[12px] text-ink-2 transition-colors hover:text-ink";

interface SearchVehicleFilterProps {
  state: SearchUrlState;
  /** Matches the search holds as it stands — what the offer would narrow. */
  total: number;
}

/**
 * Whether the results are limited to one vehicle, and the way in and out of it.
 *
 * A saved vehicle no longer scopes a search on its own. Most visitors pick one
 * once and forget it, so a search silently answered for that car looks like a
 * catalogue missing half its parts — with nothing on screen saying why. The
 * narrowing is offered here instead, where it is named, counted and reversible.
 */
export function SearchVehicleFilter({ state, total }: SearchVehicleFilterProps) {
  const router = useRouter();
  const isHydrated = useHydration();
  const savedVehicle = useVehicleContext((store) => store.selectedVehicle);
  const [isSelectorOpen, setSelectorOpen] = useState(false);

  if (!isHydrated) {
    return (
      <div
        className={cn(CARD, PLAIN_CARD, "h-[152px] animate-pulse")}
        aria-hidden="true"
      />
    );
  }

  // Read at confirm time rather than subscribed to: the selector writes the
  // vehicle to the store and calls back in the same tick, so a value captured
  // during render would still be the previous one.
  function scopeToPickedVehicle() {
    setSelectorOpen(false);
    const vehicle = useVehicleContext.getState().selectedVehicle;

    if (vehicle) {
      router.push(buildSearchUrl(withVehicle(state, vehicle.vehicleId)));
    }
  }

  function currentCard() {
    if (state.vehicleId) {
      return (
        <ScopedCard
          state={state}
          vehicle={vehicleNamed(state.vehicleId, savedVehicle)}
          onPickAnother={() => setSelectorOpen(true)}
        />
      );
    }

    if (savedVehicle) {
      return (
        <OfferCard
          state={state}
          vehicle={savedVehicle}
          total={total}
          onPickAnother={() => setSelectorOpen(true)}
        />
      );
    }

    return <InvitationCard onPick={() => setSelectorOpen(true)} />;
  }

  return (
    <>
      {currentCard()}

      <VehicleSelector
        isOpen={isSelectorOpen}
        onClose={() => setSelectorOpen(false)}
        onConfirm={scopeToPickedVehicle}
      />
    </>
  );
}

function InvitationCard({ onPick }: { onPick: () => void }) {
  return (
    <VehicleCard>
      <h2 className={cn(TITLE, "text-ink-3")}>Търсене по автомобил</h2>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
        Резултатите са за всички автомобили. Избери автомобил, за да останат
        само съвместимите части.
      </p>

      <button
        type="button"
        onClick={onPick}
        className={cn(PRIMARY_BUTTON, "mt-3.5 bg-brand hover:bg-brand-hover")}
      >
        <Car className="h-4 w-4" aria-hidden="true" />
        Избери автомобил
      </button>
    </VehicleCard>
  );
}

function OfferCard({
  state,
  vehicle,
  total,
  onPickAnother,
}: {
  state: SearchUrlState;
  vehicle: SelectedVehicle;
  total: number;
  onPickAnother: () => void;
}) {
  return (
    <VehicleCard>
      <h2 className={cn(TITLE, "text-ink-3")}>Търсене по автомобил</h2>

      <div className="mt-3">
        <VehicleIdentity vehicle={vehicle} isApplied={false} />
      </div>

      <Link
        href={buildSearchUrl(withVehicle(state, vehicle.vehicleId))}
        prefetch={false}
        className={cn(PRIMARY_BUTTON, "mt-3.5 bg-brand hover:bg-brand-hover")}
      >
        Само за този автомобил
      </Link>

      <button
        type="button"
        onClick={onPickAnother}
        className={cn(GHOST_ACTION, "mt-2.5 w-full justify-center")}
      >
        <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Друг автомобил
      </button>

      <p className="mt-3.5 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
        Сега търсим във всички {formatCount(total)} {resultNoun(total)}, без
        ограничение по автомобил.
      </p>
    </VehicleCard>
  );
}

function ScopedCard({
  state,
  vehicle,
  onPickAnother,
}: {
  state: SearchUrlState;
  vehicle: SelectedVehicle | null;
  onPickAnother: () => void;
}) {
  return (
    <VehicleCard className={SCOPED_CARD}>
      <h2 className={cn(TITLE, "text-brand")}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Търсене само за
      </h2>

      <div className="mt-3">
        <VehicleIdentity vehicle={vehicle} isApplied />
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
        Показваме само части, съвместими с този автомобил.
      </p>

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-brand/25 pt-3">
        <button type="button" onClick={onPickAnother} className={GHOST_ACTION}>
          <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Друг автомобил
        </button>

        <Link
          href={buildSearchUrl(withoutVehicle(state))}
          prefetch={false}
          className={GHOST_ACTION}
        >
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Всички части
        </Link>
      </div>
    </VehicleCard>
  );
}

function VehicleCard({
  className = PLAIN_CARD,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label="Търсене по автомобил" className={cn(CARD, className)}>
      {children}
    </section>
  );
}

/**
 * The vehicle the results are about. Renders unnamed rather than not at all,
 * because a scope arrived at through someone else's link is still a scope the
 * visitor has to be able to see and undo.
 *
 * Nothing here truncates: a model name cut short is one a visitor has to take
 * on trust, and this card is the only thing on the page saying which car the
 * results belong to.
 */
function VehicleIdentity({
  vehicle,
  isApplied,
}: {
  vehicle: SelectedVehicle | null;
  isApplied: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          isApplied ? "bg-brand" : "bg-bg-sunken",
        )}
      >
        <Car
          className={cn("h-4 w-4", isApplied ? "text-white" : "text-ink-3")}
          aria-hidden="true"
        />
      </span>

      <div className="min-w-0">
        <p className="font-display text-[15px] font-semibold uppercase leading-tight tracking-[-0.01em] text-ink">
          {vehicle
            ? `${vehicle.manufacturerName} ${vehicle.seriesName}`
            : "Избран автомобил"}
        </p>
        {vehicle && (
          <p className="mt-1 text-[12px] leading-snug text-ink-3">
            {vehicleSpec(vehicle)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The saved vehicle only names the scoped id when it *is* that vehicle. A
 * bookmarked or shared link carries an id this browser never resolved, and
 * labelling it with whatever car happens to be saved would name the wrong one.
 */
function vehicleNamed(
  vehicleId: string,
  savedVehicle: SelectedVehicle | null,
): SelectedVehicle | null {
  return savedVehicle?.vehicleId === vehicleId ? savedVehicle : null;
}

/**
 * `1.9 TDI · 66 kW · 1996–2001`. The trim and the build years are what tell two
 * variants of one model apart, and a mechanic reads the wrong one as the wrong
 * parts. `engine` is deliberately not here: TecDoc files a code in it — `AGR`,
 * `OM 699.302` — which identifies nothing to a visitor.
 */
function vehicleSpec(vehicle: SelectedVehicle): string {
  const years = vehicle.yearTo
    ? `${vehicle.yearFrom}–${vehicle.yearTo}`
    : `${vehicle.yearFrom}+`;

  return [vehicle.variantName, `${vehicle.powerKw} kW`, years].join(" · ");
}

function resultNoun(total: number): string {
  return total === 1 ? "резултат" : "резултата";
}
