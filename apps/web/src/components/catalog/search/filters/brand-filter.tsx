"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, Search } from "lucide-react";
import type { FacetValueDto } from "@vp-parts-shop/shared";
import {
  buildSearchUrl,
  clearBrands,
  toggleBrand,
  type SearchUrlState,
} from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";
import { FilterBlock } from "./filter-block";

/** Above this many brands the list is collapsed and a text filter appears. */
const COLLAPSED_LIMIT = 10;
const SEARCHABLE_THRESHOLD = 10;

/**
 * How many more rows one "show more" adds. A broad search can face the sidebar
 * with a couple of hundred suppliers, where revealing the remainder in one go
 * just trades a short list for an unreadable one. Anyone hunting a specific
 * brand that deep is served by the text filter, not by scrolling.
 */
const REVEAL_BATCH = 10;

/**
 * Brands read alphabetically because the visitor arrives knowing the name they
 * want. TecDoc's `DataSupplierFacetCount` carries no sort field, so the order
 * it answers in is unspecified — and an unspecified order makes "the first ten"
 * an arbitrary ten rather than the ten a visitor can predict and scan.
 */
const BY_BRAND_NAME = new Intl.Collator("bg", {
  sensitivity: "base",
  numeric: true,
});

interface BrandFilterProps {
  state: SearchUrlState;
  values: FacetValueDto[];
}

/**
 * Multi-select brand facet. Selected brands stay visible when the list is
 * collapsed or text-filtered — a filter you cannot see is a filter you cannot
 * remove.
 */
export function BrandFilter({ state, values }: BrandFilterProps) {
  const [term, setTerm] = useState("");
  const [revealed, setRevealed] = useState(COLLAPSED_LIMIT);

  if (values.length === 0) {
    return null;
  }

  const isSelected = (value: FacetValueDto) =>
    state.brandIds.includes(value.id);

  const sorted = [...values].sort((left, right) =>
    BY_BRAND_NAME.compare(left.label, right.label),
  );

  const matching = term.trim()
    ? sorted.filter(
        (value) =>
          isSelected(value) ||
          value.label.toLowerCase().includes(term.trim().toLowerCase()),
      )
    : sorted;

  // The cap applies to a filtered list too: a one-letter term against a few
  // hundred brands narrows to something still far too long to render.
  const visible = matching.filter(
    (value, index) => index < revealed || isSelected(value),
  );
  const hiddenCount = matching.length - visible.length;
  const isTrimmed = revealed > COLLAPSED_LIMIT;

  return (
    <FilterBlock
      title="Производител"
      clearHref={
        state.brandIds.length > 0
          ? buildSearchUrl(clearBrands(state))
          : undefined
      }
    >
      {values.length >= SEARCHABLE_THRESHOLD && (
        <div className="relative mb-3">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4"
            aria-hidden="true"
          />
          <input
            type="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setRevealed(COLLAPSED_LIMIT);
            }}
            placeholder="Търсене на марка…"
            aria-label="Търсене на марка"
            className="h-8 w-full rounded-sm border border-line bg-canvas pl-8 pr-2 text-xs text-ink placeholder:text-ink-4 focus:border-ink focus:bg-bg-card focus:outline-none"
          />
        </div>
      )}

      <ul className="flex flex-col">
        {visible.map((value) => {
          const selected = isSelected(value);

          return (
            <li key={value.id}>
              <Link
                href={buildSearchUrl(toggleBrand(state, value.id))}
                prefetch={false}
                aria-label={`${value.label}, ${value.count} ${
                  value.count === 1 ? "артикул" : "артикула"
                } — ${selected ? "премахни филтъра" : "добави филтъра"}`}
                className="group flex items-center gap-2.5 py-1.5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border-[1.5px] transition-colors",
                    selected
                      ? "border-ink bg-ink text-white"
                      : "border-line-2 text-transparent",
                  )}
                >
                  <Check className="h-2.5 w-2.5" />
                </span>

                <BrandMark name={value.label} imageUrl={value.imageUrl} />

                <span
                  className={cn(
                    "flex-1 text-[13px] transition-colors",
                    selected
                      ? "font-medium text-ink"
                      : "text-ink-2 group-hover:text-ink",
                  )}
                >
                  {value.label}
                </span>
                <span className="font-display text-xs text-ink-4">
                  ({value.count})
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {matching.length === 0 && (
        <p className="py-1 text-xs text-ink-3">Няма съвпадащи марки.</p>
      )}

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
    </FilterBlock>
  );
}

/**
 * The brand's logo where the catalogue has one, otherwise a tinted monogram.
 * The hue is derived from the name so a brand keeps the same colour on every
 * render without a palette to maintain.
 */
function BrandMark({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      <span className="relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[5px] bg-white">
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="22px"
          className="object-contain"
        />
      </span>
    );
  }

  const hue =
    ([...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) *
      47) %
    360;
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      aria-hidden="true"
      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[5px] font-display text-[9px] font-bold"
      style={{
        background: `oklch(0.93 0.045 ${hue})`,
        color: `oklch(0.42 0.11 ${hue})`,
      }}
    >
      {initials}
    </span>
  );
}
