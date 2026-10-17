import { Check } from "lucide-react";

/** Bridges the placed order and its confirmation page, which reuses this badge's look. */
export function OrderPlacedNotice() {
  return (
    <div
      role="status"
      className="flex flex-col items-center rounded-[12px] border border-line bg-bg-card px-6 py-[72px] text-center"
    >
      <span className="relative mb-5 grid h-14 w-14 place-items-center rounded-full bg-ok-soft text-ok animate-in fade-in zoom-in-50 duration-[380ms] motion-reduce:animate-none">
        <span
          className="absolute -inset-1.5 rounded-full border-2 border-ok-soft border-t-ok animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <Check className="h-7 w-7" aria-hidden="true" />
      </span>

      <p className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
        Поръчката е приета
      </p>
      <p className="mt-1.5 text-[13px] text-ink-3">Потвърждаваме я…</p>
    </div>
  );
}
