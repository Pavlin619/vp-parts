import type {
  AttributeFacetDto,
  CategoryNavigationDto,
  SearchFacetDto,
} from "@vp-parts-shop/shared";
import type { SearchUrlState } from "@/lib/catalog/search-url";
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
      className="flex flex-col gap-2 lg:sticky lg:top-6"
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
