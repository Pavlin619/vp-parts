import type { ReactNode } from "react";
import { Check, Clock, Info, MapPin, Phone } from "lucide-react";
import { PICKUP_STORE } from "@/lib/delivery/store";

/** The store a pickup is collected from. There is only one, so there is nothing to choose. */
export function StorePickupCard() {
  return (
    <div className="flex items-start gap-3.5 rounded-lg border border-line bg-bg-card p-4">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok"
      >
        <Check className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-semibold text-ink">
          {PICKUP_STORE.name}
          <span className="rounded-full bg-accent-soft px-[7px] py-0.5 text-[11px] font-semibold text-accent-hover">
            безплатно
          </span>
        </p>

        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 text-[12.5px] leading-snug text-ink-2">
          <StoreDetailRow icon={<MapPin />}>
            {PICKUP_STORE.address}, {PICKUP_STORE.cityZip}
          </StoreDetailRow>
          <StoreDetailRow icon={<Clock />}>{PICKUP_STORE.hours}</StoreDetailRow>
          <StoreDetailRow icon={<Phone />}>{PICKUP_STORE.phone}</StoreDetailRow>
        </div>

        <p className="mt-3 flex items-start gap-[7px] rounded-md bg-bg-sunken px-3 py-2 text-[12px] leading-[1.45] text-ink-2">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <span>При вземане от магазина поръчката е без такса за доставка.</span>
        </p>
      </div>
    </div>
  );
}

function StoreDetailRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex gap-2.5">
      <span aria-hidden="true" className="mt-px shrink-0 text-ink-3 [&_svg]:h-[15px] [&_svg]:w-[15px]">
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}
