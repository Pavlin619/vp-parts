"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AttributeFacetDto } from "@vp-parts-shop/shared";
import { useRetainedFacets } from "@/hooks/use-retained-facets";
import {
  buildSearchUrl,
  clearAttributes,
  facetScopeKey,
  FIRST_PAGE,
  hasDimensions,
  isAttributeSelected,
  toggleAttribute,
  withPage,
  type SearchUrlState,
} from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";
import { FilterBlock } from "./filter-block";

interface AttributeFiltersProps {
  state: SearchUrlState;
  attributes?: AttributeFacetDto[];
}

/**
 * How many criteria open on arrival. A leaf category can carry a dozen or more
 * — height, several diameters, thread, material, shape — and a wall of value
 * pills is as unusable as no filters at all, so the rest stay one click away.
 */
const OPEN_ON_ARRIVAL = 3;

/**
 * The dimension / mounting filters, which the API only computes once the search
 * has been narrowed to one product type or one leaf category — a broader
 * selection spans unrelated product types, so its criteria would be an
 * incoherent wall of values.
 *
 * That gate is invisible to the visitor, so this block stays on screen with an
 * explanation of what to do next rather than silently disappearing.
 */
export function AttributeFilters({ state, attributes }: AttributeFiltersProps) {
  // Page 2+ carries no attribute block; the page-1 one is retained so the
  // filters do not vanish mid-pagination.
  const facets = useRetainedFacets(attributes, facetScopeKey(state));
  // Only what the visitor opened or closed by hand. Keeping the overrides
  // rather than the resolved state lets the defaults keep tracking the data:
  // the criteria change with every narrowing, and a remembered "expanded" set
  // would be answering for a block that is no longer on screen.
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>(
    {},
  );
  if (!hasDimensions(state)) {
    return (
      <FilterBlock title="Размери и монтаж">
        <p className="text-xs leading-relaxed text-ink-3">
          {state.categoryPath.length === 0
            ? "Изберете категория или вид част, за да филтрирате по размери и място на монтаж."
            : "Изберете по-конкретна подкатегория или вид част, за да видите размерите."}
        </p>
      </FilterBlock>
    );
  }

  // Retention only helps once page 1 has been seen. Landing straight on a later
  // page — a shared link, a reload — leaves nothing to retain, and "there are
  // none" would then be a guess rather than an answer.
  if (facets.length === 0 && state.page > FIRST_PAGE) {
    return (
      <FilterBlock title="Размери и монтаж">
        <p className="text-xs leading-relaxed text-ink-3">
          <Link
            href={buildSearchUrl(withPage(state, FIRST_PAGE))}
            prefetch={false}
            className="font-medium text-ink underline underline-offset-2"
          >
            Върнете се на първата страница
          </Link>
          , за да филтрирате по размери.
        </p>
      </FilterBlock>
    );
  }

  if (facets.length === 0) {
    return (
      <FilterBlock title="Размери и монтаж">
        <p className="text-xs leading-relaxed text-ink-3">
          За тази категория няма технически размери за филтриране.
        </p>
      </FilterBlock>
    );
  }

  return (
    <FilterBlock
      title="Размери и монтаж"
      clearHref={
        state.attributes.length > 0
          ? buildSearchUrl(clearAttributes(state))
          : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {orderedFacets(facets).map((facet, index) => {
          const selectedCount = selectedValueCount(state, facet);
          const isOpen =
            openOverrides[facet.id] ??
            (index < OPEN_ON_ARRIVAL || selectedCount > 0);

          return (
            <fieldset key={facet.id}>
              <legend className="w-full">
                <button
                  type="button"
                  onClick={() =>
                    setOpenOverrides((overrides) => ({
                      ...overrides,
                      [facet.id]: !isOpen,
                    }))
                  }
                  aria-expanded={isOpen}
                  aria-controls={`criterion-${facet.id}`}
                  className="flex w-full items-baseline gap-1.5 py-0.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3 transition-colors hover:text-ink"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "h-3 w-3 shrink-0 self-center text-ink-4 transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                  <span className="flex-1">{facet.label}</span>
                  {facet.unit && (
                    <span className="normal-case tracking-normal text-ink-4">
                      {facet.unit}
                    </span>
                  )}
                  {/* A selection the visitor has collapsed out of sight still
                      has to announce itself here. */}
                  {!isOpen && selectedCount > 0 && (
                    <span className="rounded-full bg-ink px-1.5 text-[10px] leading-4 text-white">
                      {selectedCount}
                    </span>
                  )}
                </button>
              </legend>

              {isOpen && (
                <div
                  id={`criterion-${facet.id}`}
                  className="mt-[7px] flex flex-wrap gap-1.5"
                >
                  {facet.values.map((value) => {
                    const selected = isAttributeSelected(
                      state,
                      facet.id,
                      value.value,
                    );

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
              )}
            </fieldset>
          );
        })}
      </div>
    </FilterBlock>
  );
}

function selectedValueCount(
  state: SearchUrlState,
  facet: AttributeFacetDto,
): number {
  return state.attributes.filter(
    (selection) => selection.criteriaId === facet.id,
  ).length;
}

/**
 * The order the criteria are offered in, and with it which ones open on
 * arrival.
 *
 * Whether a criterion can narrow at all comes first: one holding a single value
 * describes every article in the result set, so selecting it changes nothing
 * and it must not take an open slot however important it is. Among the ones
 * that can narrow, `isMandatory` is the catalogue's own verdict on which
 * criteria define the part rather than merely describe it. A role we recognised
 * (fitting position, axle, side) outranks even that — a mechanic reaches for it
 * before any dimension.
 *
 * TecDoc can rank the criteria itself via `includeCriteriaFacetsSorting`, but
 * only for a search filtered to one `linkageTargetId` and one
 * `genericArticleId`. Until the search is vehicle-scoped that call is
 * unavailable, so this ordering stands in for it.
 */
function orderedFacets(facets: AttributeFacetDto[]): AttributeFacetDto[] {
  const rank = (facet: AttributeFacetDto): number => {
    if (facet.values.length <= 1) {
      return 3;
    }

    if (facet.role) {
      return 0;
    }

    return facet.isMandatory ? 1 : 2;
  };

  return [...facets].sort((left, right) => rank(left) - rank(right));
}
