import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from "./address-action-buttons";

export type AddressReviewState =
  | { kind: "suggestion"; typedLabel: string; suggestedLabel: string }
  | { kind: "unavailable" };

interface AddressReviewProps {
  review: AddressReviewState;
  carrierName: string;
  onAcceptSuggestion: () => void;
  onKeepTyped: () => void;
}

/** What the carrier made of the address: a correction to choose, or that it could not be checked. */
export function AddressReview({
  review,
  carrierName,
  onAcceptSuggestion,
  onKeepTyped,
}: AddressReviewProps) {
  if (review.kind === "unavailable") {
    return (
      <p role="alert" className="mt-3.5 text-[12.5px] text-danger">
        Не успяхме да проверим адреса. Опитай отново след малко.
      </p>
    );
  }

  return (
    <div role="status" className="mt-3.5 rounded-[10px] border border-line-2 bg-bg-sunken p-4">
      <p className="text-[12.5px] font-semibold text-ink-2">
        {carrierName} предлага корекция на адреса
      </p>

      <dl className="mt-3 flex flex-col gap-2.5">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">
            Въведен от теб
          </dt>
          <dd className="mt-0.5 text-[13.5px] text-ink-3 line-through decoration-ink-4">
            {review.typedLabel}
          </dd>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-ok/30 bg-ok-soft p-3">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ok">
              Предложение
            </dt>
            <dd className="mt-0.5 text-[14px] font-semibold text-ink">{review.suggestedLabel}</dd>
          </div>
        </div>
      </dl>

      <div className="mt-4 flex justify-end gap-2 max-sm:flex-col-reverse max-sm:[&>*]:w-full">
        <Button
          type="button"
          variant="outline"
          onClick={onKeepTyped}
          className={SECONDARY_ACTION_CLASS}
        >
          Запази моя адрес
        </Button>
        <Button type="button" onClick={onAcceptSuggestion} className={PRIMARY_ACTION_CLASS}>
          Използвай предложението
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
