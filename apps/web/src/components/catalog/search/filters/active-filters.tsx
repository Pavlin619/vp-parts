import Link from "next/link";
import { X } from "lucide-react";
import type {
  AttributeFacetDto,
  CategoryNavigationDto,
  SearchFacetDto,
} from "@vp-parts-shop/shared";
import {
  buildSearchUrl,
  clearAllFilters,
  clearCategory,
  clearProductType,
  encodeAttribute,
  hasActiveFilters,
  toggleAttribute,
  toggleBrand,
  type SearchUrlState,
} from "@/lib/catalog/search-url";

interface ActiveFiltersProps {
  state: SearchUrlState;
  facets?: SearchFacetDto[];
  attributes?: AttributeFacetDto[];
  categoryNavigation?: CategoryNavigationDto;
}

interface Chip {
  key: string;
  label: string;
  href: string;
}

/**
 * Every narrowing currently applied, each removable in one click. The sidebar
 * alone is not enough: a selected value can sit below the fold, inside a
 * collapsed brand list, or — for attributes on page 2 — in a block the API did
 * not return, and an invisible filter reads as broken results.
 */
export function ActiveFilters({
  state,
  facets,
  attributes,
  categoryNavigation,
}: ActiveFiltersProps) {
  if (!hasActiveFilters(state)) {
    return null;
  }

  const chips = [
    ...categoryChip(state, categoryNavigation),
    ...productTypeChip(state, facets),
    ...brandChips(state, facets),
    ...attributeChips(state, attributes),
  ];

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs text-ink-3">Активни филтри:</span>

      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          prefetch={false}
          aria-label={`Премахни филтъра ${chip.label}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg-card py-1 pl-3 pr-2 text-xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
        >
          {chip.label}
          <X className="h-3 w-3 text-ink-4" aria-hidden="true" />
        </Link>
      ))}

      <Link
        href={buildSearchUrl(clearAllFilters(state))}
        prefetch={false}
        className="text-xs font-medium text-ink-3 underline underline-offset-2 transition-colors hover:text-brand"
      >
        Изчисти всички
      </Link>
    </div>
  );
}

function categoryChip(
  state: SearchUrlState,
  navigation?: CategoryNavigationDto,
): Chip[] {
  if (state.categoryPath.length === 0) {
    return [];
  }

  return [
    {
      key: "category",
      label: navigation?.current?.label ?? "Избрана категория",
      href: buildSearchUrl(clearCategory(state)),
    },
  ];
}

/**
 * Labels for one facet's values, keyed by id. Scoped to a single facet because
 * ids are only unique within one: a product type and a brand can share a
 * number, and a flattened map would label one with the other's name.
 */
function labelsOf(
  facets: SearchFacetDto[] | undefined,
  id: SearchFacetDto["id"],
): Map<string, string> {
  const values = facets?.find((facet) => facet.id === id)?.values ?? [];

  return new Map(values.map((value) => [value.id, value.label]));
}

/**
 * Falls back to the raw id when the brand is missing from the current facet
 * block — which happens when a selection narrows the results to the point that
 * TecDoc stops reporting the other brands.
 */
function brandChips(state: SearchUrlState, facets?: SearchFacetDto[]): Chip[] {
  const labelById = labelsOf(facets, "brands");

  return state.brandIds.map((brandId) => ({
    key: `brand-${brandId}`,
    label: labelById.get(brandId) ?? brandId,
    href: buildSearchUrl(toggleBrand(state, brandId)),
  }));
}

function productTypeChip(
  state: SearchUrlState,
  facets?: SearchFacetDto[],
): Chip[] {
  const { productTypeId } = state;

  if (productTypeId === undefined) {
    return [];
  }

  return [
    {
      key: "product-type",
      label: labelsOf(facets, "productTypes").get(productTypeId) ?? productTypeId,
      href: buildSearchUrl(clearProductType(state)),
    },
  ];
}

function attributeChips(
  state: SearchUrlState,
  attributes?: AttributeFacetDto[],
): Chip[] {
  const facetById = new Map(
    (attributes ?? []).map((facet) => [facet.id, facet]),
  );

  return state.attributes.map((selection) => {
    const facet = facetById.get(selection.criteriaId);
    const value = facet?.values.find(
      (candidate) => candidate.value === selection.value,
    );
    const label = value?.label ?? selection.value;

    return {
      key: `attr-${encodeAttribute(selection)}`,
      label: facet ? `${facet.label}: ${label}` : label,
      href: buildSearchUrl(
        toggleAttribute(state, selection.criteriaId, selection.value),
      ),
    };
  });
}
