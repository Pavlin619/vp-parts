"use client";

import { Car, Info } from "lucide-react";

interface SearchWideSetNoticeProps {
  onOpenVehicleSelector: () => void;
  onHide: () => void;
}

/**
 * Why a broad search is not ordered by what we can ship, and the fastest way
 * out of it.
 *
 * A match set past the API's sortable limit comes back in the catalogue's own
 * order with no stock counts, so the availability control is not on offer and
 * neither is a price sort. That is worth saying rather than leaving the visitor
 * to page an order that means nothing to them — but it is a prompt, not an
 * apology: picking a vehicle usually brings a search under the limit in one
 * step, which is why the action sits inside the notice.
 */
export function SearchWideSetNotice({
  onOpenVehicleSelector,
  onHide,
}: SearchWideSetNoticeProps) {
  return (
    <aside className="mb-4 flex items-start gap-3 rounded-[10px] bg-warn-soft px-3.5 py-3">
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-warn"
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug text-ink">
          За точно филтриране по <strong className="font-semibold">наличност</strong>{" "}
          и <strong className="font-semibold">цена</strong> изберете по-конкретен
          резултат.
        </p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">
          Изберете автомобил, категория или производител — филтрите се включват
          автоматично.
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenVehicleSelector}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-accent"
        >
          <Car className="h-3.5 w-3.5" aria-hidden="true" />
          Избери автомобил
        </button>

        <button
          type="button"
          onClick={onHide}
          className="text-[12px] text-ink-3 underline-offset-2 transition-colors hover:text-ink hover:underline"
        >
          Скрий
        </button>
      </div>
    </aside>
  );
}

/**
 * What the notice collapses to, beside the result count.
 *
 * Hiding it outright would leave a visitor holding an unranked list with
 * nothing on screen saying so — and no way back to the prompt that explains it.
 * This keeps the fact one click away and costs a badge.
 */
export function SearchWideSetBadge({ onShow }: { onShow: () => void }) {
  return (
    <button
      type="button"
      onClick={onShow}
      aria-expanded="false"
      title="Защо не мога да филтрирам по наличност и цена?"
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink"
    >
      <Info className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
      Без филтри по наличност
    </button>
  );
}
