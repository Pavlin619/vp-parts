import type {
  CategoryNavigationDto,
  SearchFacetDto,
} from "@vp-parts-shop/shared";
import { markLastAsCurrent, type BreadcrumbItem } from "../breadcrumbs";
import {
  buildSearchUrl,
  selectCategoryPath,
  type SearchUrlState,
} from "./search-url";

const HOME_CRUMB: BreadcrumbItem = { key: "home", label: "Начало", href: "/" };

/** Mirrors the active-filter chip, so an unnamed category reads the same way. */
const UNNAMED_CATEGORY_LABEL = "Избрана категория";

interface SearchBreadcrumbsInput {
  state: SearchUrlState;
  categoryNavigation?: CategoryNavigationDto;
  facets?: SearchFacetDto[];
}

/**
 * The trail from the catalogue root down to whatever the search is narrowed to.
 *
 * It describes a position in the category tree and nothing else: the search
 * term is deliberately left out, because it already heads the results and says
 * nothing about where in the catalogue the visitor is standing.
 *
 * The trail comes from the API rather than from `categoryPath`, which records
 * the steps that were clicked — a category suggestion in the autocomplete jumps
 * straight to a deep leaf, and the URL then holds one step for a node several
 * levels down.
 */
export function buildSearchBreadcrumbs({
  state,
  categoryNavigation,
  facets,
}: SearchBreadcrumbsInput): BreadcrumbItem[] {
  return markLastAsCurrent([
    HOME_CRUMB,
    allCategoriesCrumb(state),
    ...categoryCrumbs(state, categoryNavigation),
    ...productTypeCrumbs(state, facets),
  ]);
}

function allCategoriesCrumb(state: SearchUrlState): BreadcrumbItem {
  return {
    key: "all-categories",
    label: "Всички категории",
    href: crumbHref(state, []),
  };
}

/**
 * The ancestors and the selected node, each pointing at its own path in the
 * tree. A node the catalogue could not name keeps its crumb rather than being
 * dropped: an omitted one would show the trail of an unnarrowed search over
 * narrowed results.
 */
function categoryCrumbs(
  state: SearchUrlState,
  navigation?: CategoryNavigationDto,
): BreadcrumbItem[] {
  const current = navigation?.current;

  if (!current) {
    return state.categoryPath.length === 0
      ? []
      : [
          {
            key: "category",
            label: UNNAMED_CATEGORY_LABEL,
            href: crumbHref(state, state.categoryPath),
          },
        ];
  }

  const trail = [...(navigation?.ancestors ?? []), current];

  return trail.map((node, index) => ({
    key: `category-${node.id}`,
    label: node.label,
    href: crumbHref(
      state,
      trail.slice(0, index + 1).map((ancestor) => ancestor.id),
    ),
  }));
}

/**
 * The deepest level of the drill, below the assembly groups. Its label lives in
 * the product-type facet, which narrows to the selection itself once one is
 * made — so the id is the fallback, exactly as for the filter chips.
 */
function productTypeCrumbs(
  state: SearchUrlState,
  facets?: SearchFacetDto[],
): BreadcrumbItem[] {
  const { productTypeId } = state;

  if (productTypeId === undefined) {
    return [];
  }

  const values =
    facets?.find((facet) => facet.id === "productTypes")?.values ?? [];
  const label = values.find((value) => value.id === productTypeId)?.label;

  return [
    { key: `product-type-${productTypeId}`, label: label ?? productTypeId },
  ];
}

function crumbHref(state: SearchUrlState, categoryPath: string[]): string {
  return buildSearchUrl(selectCategoryPath(state, categoryPath));
}
