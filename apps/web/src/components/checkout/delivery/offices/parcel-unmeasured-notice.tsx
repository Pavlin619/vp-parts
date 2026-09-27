import { Scale } from "lucide-react";

/** A part with no known weight cannot be priced by the courier — see docs/DELIVERY-PROVIDERS.md. */
export function ParcelUnmeasuredNotice() {
  return (
    <p
      role="status"
      className="flex items-start gap-[7px] rounded-[10px] border border-line bg-warn-soft px-3.5 py-2.5 text-[12.5px] leading-[1.45] text-ink-2"
    >
      <Scale className="mt-px h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
      <span>
        Някои артикули нямат данни за тегло. Ще ви се обадим с цената на доставката, след като
        ги измерим.
      </span>
    </p>
  );
}
