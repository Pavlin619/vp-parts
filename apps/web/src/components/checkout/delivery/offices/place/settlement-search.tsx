"use client";

import { useId, useMemo, useState, type FocusEvent } from "react";
import { MapPin, X } from "lucide-react";
import type { DeliveryPlaceDto } from "@vp-parts-shop/shared";
import { suggestPlaces } from "@/lib/checkout/delivery/delivery-places";
import { SuggestionButton } from "../suggestion-button";

/** Fewer letters than this match too much to say that nothing matched. */
const MIN_NO_MATCH_LENGTH = 2;

interface SettlementSearchProps {
  places: DeliveryPlaceDto[];
  /** Keeps the suggestions to one region; null searches the whole country. */
  region: string | null;
  place: DeliveryPlaceDto | null;
  onPick: (place: DeliveryPlaceDto) => void;
  onClear: () => void;
}

/** Finds the customer's town or village by name or post code, across the country or one region. */
export function SettlementSearch({ places, region, place, onPick, onClear }: SettlementSearchProps) {
  const suggestionsId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [shownPlace, setShownPlace] = useState(place);

  // A place chosen from outside, by "Близо до мен", replaces whatever was typed.
  if (place !== shownPlace) {
    setShownPlace(place);
    if (place) {
      setDraft(null);
    }
  }

  const text = draft ?? place?.name ?? "";
  const suggestions = useMemo(
    () => (draft === null ? [] : suggestPlaces(places, { query: draft, region })),
    [places, draft, region],
  );
  const hasNoMatch = suggestions.length === 0 && (draft ?? "").trim().length >= MIN_NO_MATCH_LENGTH;
  const isShowingPanel = isOpen && (suggestions.length > 0 || hasNoMatch);

  const type = (value: string) => {
    setDraft(value);
    setIsOpen(true);
    if (place) {
      onClear();
    }
  };

  const pick = (picked: DeliveryPlaceDto) => {
    setDraft(null);
    setIsOpen(false);
    onPick(picked);
  };

  const clear = () => {
    setDraft("");
    onClear();
  };

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative min-w-0" onBlur={closeWhenFocusLeaves}>
      <div className="flex h-[42px] items-center gap-2 rounded-lg border border-line bg-bg-card px-3 focus-within:border-ink">
        <MapPin className="h-[15px] w-[15px] shrink-0 text-ink-3" aria-hidden="true" />
        <input
          type="search"
          value={text}
          onChange={(event) => type(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => event.key === "Escape" && setIsOpen(false)}
          placeholder="Град, село или пощенски код"
          aria-label="Населено място"
          aria-controls={suggestionsId}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-4 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {text !== "" && (
          <button
            type="button"
            onClick={clear}
            aria-label="Изчисти населеното място"
            className="rounded p-0.5 text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {isShowingPanel && (
        <div
          id={suggestionsId}
          aria-label="Населени места"
          className="absolute inset-x-0 top-[46px] z-20 flex flex-col rounded-lg border border-line bg-bg-card p-1.5 shadow-modal"
        >
          {suggestions.map((suggested) => (
            <SuggestionButton key={suggested.id} onClick={() => pick(suggested)}>
              <span className="truncate">{suggested.name}</span>
              <small className="ml-auto shrink-0 text-[11.5px] text-ink-4">
                {suggested.region} · {suggested.postCode}
              </small>
            </SuggestionButton>
          ))}

          {hasNoMatch && (
            <p className="px-2.5 py-2 text-[12.5px] text-ink-3">
              Не намираме такова населено място. Изберете най-близкия град или натиснете „Близо
              до мен“.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
