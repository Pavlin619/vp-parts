import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { DeliveryOfficeType, type DeliveryOfficeDto } from "@vp-parts-shop/shared";
import { formatOfficeHours } from "@/lib/checkout/delivery/office-hours";
import { LockerTag } from "./locker-tag";

interface SelectedOfficeCardProps {
  office: DeliveryOfficeDto;
  carrierName: string;
  onChange: () => void;
}

export function SelectedOfficeCard({ office, carrierName, onChange }: SelectedOfficeCardProps) {
  const hours = formatOfficeHours(office);

  return (
    <div className="flex items-start gap-3.5 rounded-lg border border-line bg-bg-card p-4">
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok"
      >
        <Check className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[14.5px] font-semibold text-ink">
              {office.name}
              {office.type === DeliveryOfficeType.LOCKER && <LockerTag />}
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{office.address}</p>
          </div>
          <button
            type="button"
            onClick={onChange}
            className="shrink-0 text-[11.5px] font-semibold text-accent-hover hover:underline"
          >
            Промени
          </button>
        </div>

        {hours && (
          <dl className="mt-3 border-t border-line pt-3">
            <MetaItem label="Работно време">{hours}</MetaItem>
          </dl>
        )}

        <p className="mt-2.5 text-[12px] text-ink-3">
          {carrierName} ще ви изпрати SMS, когато пратката пристигне.
        </p>
      </div>
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-[11px] text-ink-4">
      <dt>{label}</dt>
      <dd className="mt-0.5 text-[12.5px] font-semibold text-ink">{children}</dd>
    </div>
  );
}
