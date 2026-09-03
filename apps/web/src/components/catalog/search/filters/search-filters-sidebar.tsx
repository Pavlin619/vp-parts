import type {
  AttributeFacetDto,
  CategoryNavigationDto,
  SearchFacetDto,
} from "@vp-parts-shop/shared";
import type { SearchUrlState } from "@/lib/catalog/search-url";
import { cn } from "@/lib/utils";
import { CategoryFilter } from "./category-filter";
import { BrandFilter } from "./brand-filter";
import { AttributeFilters } from "./attribute-filters";
import { SearchVehicleFilter } from "./search-vehicle-filter";

interface SearchFiltersSidebarProps {
  state: SearchUrlState;
  total: number;
  facets?: SearchFacetDto[];
  attributes?: AttributeFacetDto[];
  categoryNavigation?: CategoryNavigationDto;
}

/**
 * The narrowing axes the search API exposes, in the order a part is actually
 * identified: which car it is for, then where on that car it belongs and what
 * kind of part it is — one drill down TecDoc's tree — then who made it, then
 * which variant fits.
 *
 * The vehicle leads because it is the strongest narrowing of the four and the
 * only one that is not a facet of the results: it re-runs the search against a
 * different TecDoc linkage rather than filtering what came back.
 *
 * **The height bound is what makes `sticky` usable, not a refinement of it.** A
 * pinned element stops moving relative to the viewport, so whatever hangs below
 * the fold is only revealed once the grid itself runs out — meaning the
 * dimensions, which sit last, were reachable only by scrolling to the end of
 * the results column. And overflowing is the normal case rather than the edge:
 * the category list is uncapped at 9–56 rows, which put 13 of 14 measured
 * queries over a 900px viewport before any dimension block was even rendered
 * (`помпа`, 56 rows, ~2,456px). Capping the list would have fixed it too, but
 * every category and every dimension stays on offer here, so the sidebar
 * carries its own scroll instead.
 */
export function SearchFiltersSidebar({
  state,
  total,
  facets,
  attributes,
  categoryNavigation,
}: SearchFiltersSidebarProps) {
  const valuesOf = (id: SearchFacetDto["id"]) =>
    facets?.find((facet) => facet.id === id)?.values ?? [];

  return (
    <aside
      aria-label="Филтри"
      className={cn(
        "flex flex-col gap-2 thin-scrollbar",
        "lg:sticky lg:top-[calc(var(--header-height)+1.5rem)]",
        "lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:overflow-y-auto",
      )}
    >
      <SearchVehicleFilter state={state} total={total} />
      <CategoryFilter
        state={state}
        navigation={categoryNavigation}
        productTypes={valuesOf("productTypes")}
      />
      <BrandFilter state={state} values={valuesOf("brands")} />
      <AttributeFilters state={state} attributes={attributes} />
    </aside>
  );
}
