import type {
  AttributeFacetDto,
  CategoryNavigationDto,
  SearchFacetDto,
} from "@vp-parts-shop/shared";
import type { SearchUrlState } from "@/lib/catalog/search-url";
import { CategoryFilter } from "./category-filter";
import { BrandFilter } from "./brand-filter";
import { AttributeFilters } from "./attribute-filters";

interface SearchFiltersSidebarProps {
  state: SearchUrlState;
  facets?: SearchFacetDto[];
  attributes?: AttributeFacetDto[];
  categoryNavigation?: CategoryNavigationDto;
}

/**
 * The narrowing axes the search API exposes, in the order a part is actually
 * identified: where on the car it belongs and what kind of part it is — one
 * drill down TecDoc's tree — then who made it, then which variant fits.
 */
export function SearchFiltersSidebar({
  state,
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
