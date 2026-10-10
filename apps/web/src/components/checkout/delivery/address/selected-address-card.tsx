import { Check } from "lucide-react";

interface SelectedAddressCardProps {
  address: string;
  note?: string;
  carrierName: string;
  onChange: () => void;
}

export function SelectedAddressCard({ address, note, carrierName, onChange }: SelectedAddressCardProps) {
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
            <p className="text-[14.5px] font-semibold text-ink">Адрес за доставка</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{address}</p>
            {note && <p className="mt-0.5 text-[12.5px] text-ink-4">Бележка: {note}</p>}
          </div>
          <button
            type="button"
            onClick={onChange}
            className="shrink-0 text-[11.5px] font-semibold text-accent-hover hover:underline"
          >
            Промени
          </button>
        </div>

        <p className="mt-2.5 text-[12px] text-ink-3">
          {carrierName} доставя до адреса. Куриерът ще ти се обади преди пристигане.
        </p>
      </div>
    </div>
  );
}
