import type {
  CategoryNavigationDto,
  SearchFacetDto,
} from "@vp-parts-shop/shared";
import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { buildSearchBreadcrumbs } from "@/lib/catalog/breadcrumbs/search-breadcrumbs";
import type { SearchUrlState } from "@/lib/catalog/url/search-url";

interface SearchBreadcrumbsProps {
  state: SearchUrlState;
  categoryNavigation?: CategoryNavigationDto;
  facets?: SearchFacetDto[];
}

/** Where the results sit in the category tree, above the whole two-column row. */
export function SearchBreadcrumbs(props: SearchBreadcrumbsProps) {
  return <Breadcrumbs items={buildSearchBreadcrumbs(props)} />;
}
