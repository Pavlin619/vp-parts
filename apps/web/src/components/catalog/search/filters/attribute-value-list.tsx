"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  AttributeFacetDto,
  AttributeFacetValueDto,
} from "@vp-parts-shop/shared";
import {
  buildSearchUrl,
  isAttributeSelected,
  toggleAttribute,
  type SearchUrlState,
} from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";

/**
 * How many values a criterion offers before it has to be asked for the rest.
 *
 * Most criteria never reach it — the median is 6 values over 431 measured
 * across ten product types — so this trims the fifth of them that arrive at or
 * near the API's ceiling. Twelve is two or three rows of pills, which is what
 * the sidebar can carry beside two other open criteria.
 */
const COLLAPSED_LIMIT = 12;

/**
 * One reveal is deliberately larger than the brand list's, because this list
 * has a known end: `DIMENSION_VALUE_LIMIT` caps a criterion at 60 values, so
 * 12 → 36 → 60 always reaches the whole set in two clicks. The brand facet
 * drips 10 at a time because it can run to several hundred and leans on its
 * text filter instead.
 *
 * A reveal adds the next most-matched values, which on a measurement land
 * *between* the ones already shown rather than after them. That is the cost of
 * keeping the scale in order, and it is the right way round: the alternative
 * appends a tail nobody clicks and leaves the popular sizes hidden.
 */
const REVEAL_BATCH = 24;

interface AttributeValueListProps {
  state: SearchUrlState;
  facet: AttributeFacetDto;
  values: readonly AttributeFacetValueDto[];
}

/**
 * The selectable values of one criterion, capped until asked to grow.
 *
 * **Which** values the window holds is decided by count; **what order** they
 * appear in stays the API's. That is the same two-step the API's own cap makes
 * — `capValues` keeps the most-matched, `orderValues` then sorts a measurement
 * up its scale — so this applies the established rule at a smaller limit
 * rather than inventing a second one.
 *
 * Taking the first twelve in display order instead looked simpler and was
 * measured much worse, because for a measurement that prefix is its low end:
 * over 118 numeric criteria it reached a median 21% of the matched articles
 * against 62% for the most-matched twelve, and on brake-disc `Кръг на дупките`
 * it was 3% — a run of 55–69 mm noise in place of the bolt patterns anyone
 * would click (98, 100, 108, 112, 114.3, 120). Key tables are unaffected
 * either way, at 99% both, since the API already orders those by count.
 */
export function AttributeValueList({
  state,
  facet,
  values,
}: AttributeValueListProps) {
  const [revealed, setRevealed] = useState(COLLAPSED_LIMIT);

  if (values.length === 0) {
    return null;
  }

  const isSelected = (value: AttributeFacetValueDto) =>
    isAttributeSelected(state, facet.id, value.value);

  // Stable, so equal counts keep the order the API sent them in and one set
  // cannot come back windowed two ways.
  const mostMatched = new Set(
    [...values]
      .sort((left, right) => right.count - left.count)
      .slice(0, revealed)
      .map((value) => value.value),
  );

  // A selection outside the window stays on screen: a filter the visitor
  // cannot see is a filter they cannot remove.
  const visible = values.filter(
    (value) => mostMatched.has(value.value) || isSelected(value),
  );
  const hiddenCount = values.length - visible.length;
  const isTrimmed = revealed > COLLAPSED_LIMIT;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((value) => {
          const selected = isSelected(value);

          return (
            <Link
              key={value.value}
              href={buildSearchUrl(
                toggleAttribute(state, facet.id, value.value),
              )}
              prefetch={false}
              aria-label={`${facet.label} ${value.label} — ${
                selected ? "премахни филтъра" : "добави филтъра"
              }`}
              className={cn(
                "rounded-full border px-2.5 py-[5px] font-mono text-xs transition-colors",
                selected
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-canvas text-ink-2 hover:border-ink-3",
              )}
            >
              {value.label}{" "}
              <span
                className={cn(
                  "text-[10px]",
                  selected ? "text-white/60" : "text-ink-4",
                )}
              >
                ({value.count})
              </span>
            </Link>
          );
        })}
      </div>

      {(hiddenCount > 0 || isTrimmed) && (
        <div className="mt-2 flex items-center gap-3">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setRevealed((count) => count + REVEAL_BATCH)}
              className="text-xs font-medium text-ink-3 underline underline-offset-2 transition-colors hover:text-ink"
            >
              {hiddenCount > REVEAL_BATCH
                ? `Покажи още ${REVEAL_BATCH} от ${hiddenCount}`
                : `Покажи още ${hiddenCount}`}
            </button>
          )}
          {isTrimmed && (
            <button
              type="button"
              onClick={() => setRevealed(COLLAPSED_LIMIT)}
              className="text-xs text-ink-4 underline underline-offset-2 transition-colors hover:text-ink"
            >
              Покажи по-малко
            </button>
          )}
        </div>
      )}
    </div>
  );
}
