import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The three steps of placing an order, shared by every page along the way. The
 * steps ahead are listed because a customer deciding whether to go on wants to
 * know how much is left, not because they are reachable from here.
 */
const CHECKOUT_STEPS = [
  { number: 1, label: "Кошница" },
  { number: 2, label: "Доставка и плащане" },
  { number: 3, label: "Потвърждение" },
] as const;

interface CheckoutStepsProps {
  /** The step the page showing this indicator is. */
  current: number;
}

export function CheckoutSteps({ current }: CheckoutStepsProps) {
  return (
    <nav aria-label="Стъпки на поръчката" className="mb-6">
      <ol className="flex flex-wrap items-center gap-2.5">
        {CHECKOUT_STEPS.map((step, index) => {
          const isDone = step.number < current;
          const isCurrent = step.number === current;

          return (
            <li key={step.number} className="flex items-center gap-2.5">
              {index > 0 && (
                <span
                  // Hidden where the steps wrap: a rule between two steps
                  // becomes a dash leading a line and pointing at nothing.
                  className="hidden h-px w-7 shrink-0 bg-line-2 sm:block"
                  aria-hidden="true"
                />
              )}

              <span
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 text-[13px] font-semibold",
                  isCurrent && "text-ink",
                  isDone && "text-ink-2",
                  !isCurrent && !isDone && "text-ink-4",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-[22px] w-[22px] place-items-center rounded-full border border-line bg-bg-sunken font-display text-[11.5px] font-bold text-ink-3",
                    isCurrent && "border-ink bg-ink text-white",
                    isDone && "border-transparent bg-ok-soft text-ok",
                  )}
                >
                  {isDone ? <Check className="h-3 w-3" /> : step.number}
                </span>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
