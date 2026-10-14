import { Clock, MapPin, Phone, Store } from "lucide-react";
import { PICKUP_STORE } from "@/lib/delivery/store";

interface StorePanelProps {
  readyLabel: string;
}

/** Free in-store pickup detail: ready date and the shop's address/hours/phone. */
export function StorePanel({ readyLabel }: StorePanelProps) {
  return (
    <div>
      <div className="flex gap-3">
        <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent-hover">
          <Store className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight text-ink">
            {PICKUP_STORE.name}
            <span className="ml-1.5 inline-block rounded-full bg-accent-soft px-[7px] py-0.5 align-[1px] text-[11px] font-semibold text-accent-hover">
              безплатно
            </span>
          </p>
          <p className="mt-[3px] text-xs text-ink-3">
            Готово за вземане{" "}
            <b className="font-semibold text-ink-2" data-testid="delivery-estimate-chip-store">
              {readyLabel}
            </b>
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2.5 border-t border-dashed border-line pt-3 text-[12.5px] leading-snug text-ink-2">
        <StoreDetailRow icon={<MapPin className="h-[15px] w-[15px]" aria-hidden="true" />}>
          {PICKUP_STORE.address}
          <br />
          {PICKUP_STORE.cityZip}
        </StoreDetailRow>
        <StoreDetailRow icon={<Clock className="h-[15px] w-[15px]" aria-hidden="true" />}>
          {PICKUP_STORE.hours}
        </StoreDetailRow>
        <StoreDetailRow icon={<Phone className="h-[15px] w-[15px]" aria-hidden="true" />}>
          {PICKUP_STORE.phone}
        </StoreDetailRow>
      </div>
    </div>
  );
}

function StoreDetailRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex gap-2.5">
      <span className="mt-px shrink-0 text-ink-3">{icon}</span>
      <span>{children}</span>
    </p>
  );
}
