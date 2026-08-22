import type {
  ArticleSummaryDto,
  PaginatedCatalogArticlesDto,
} from '../catalog/articles.dto';
import type { AutocompleteItemDto } from './autocomplete.dto';

export interface FacetValueDto {
  id: string;
  label: string;
  count: number;
  imageUrl?: string | null;
}

/**
 * Which axis a facet block narrows on:
 * - `brands` — who made the part (TecDoc dataSupplierId).
 * - `productTypes` — what the part *is*. TecDoc calls this the generic article
 *   ("Oil Filter", "Brake Disc") and defines every technical criterion against
 *   it, which makes a single selected product type the strongest guarantee that
 *   a result set shares one set of dimensions.
 */
export type SearchFacetId = 'brands' | 'productTypes';

/**
 * Carries no group heading: the `id` says which axis this is, and what to call
 * it is the client's decision to make in its own locale. A heading shipped from
 * the API would be a second copy of a string the client already owns — and the
 * two would eventually disagree.
 */
export interface SearchFacetDto {
  id: SearchFacetId;
  values: FacetValueDto[];
}

export interface AttributeFacetValueDto {
  value: string;
  label: string;
  count: number;
}

/**
 * One applied technical-attribute narrowing: the criterion's id plus the
 * machine `value` echoed back from an {@link AttributeFacetValueDto}. The API
 * receives these as repeatable `attr=criteriaId:value` query params.
 */
export interface AttributeSelectionDto {
  criteriaId: string;
  value: string;
}

/**
 * A semantic role the client can render with a dedicated control.
 */
export type AttributeFacetRole = 'fitting-position' | 'axle' | 'side';

export interface AttributeFacetDto {
  id: string;
  label: string;
  unit?: string | null;
  type: string;
  isInterval: boolean;
  /**
   * TecDoc's `CriteriaInfo.isMandatory` — whether a data supplier is obliged to
   * file this criterion against the generic article. It is the catalogue's own
   * statement of which criteria define the part rather than merely describe it,
   * so it is what the client leads the dimension list with.
   */
  isMandatory: boolean;
  role?: AttributeFacetRole | null;
  values: AttributeFacetValueDto[];
}

export interface CategoryOptionDto {
  id: string;
  label: string;
  count: number | null;
  hasChildren: boolean;
}

/**
 * Single-level category navigation for progressively narrowing a search.
 */
export interface CategoryNavigationDto {
  current: CategoryOptionDto | null;
  /**
   * The selected node's ancestors, outermost first and excluding `current`, so
   * a client can render the drill as a breadcrumb.
   *
   * It is the tree's own path, which is not the path the visitor clicked: a
   * category suggestion in the autocomplete jumps straight to a deep leaf, and
   * the URL then records one step for a node several levels down. Only the
   * catalogue knows what sits above it.
   *
   * Best-effort for the same reason as `current` — the facet is scoped to the
   * match set, so an ancestor TecDoc omits cannot be named. A short trail is
   * therefore normal and means the ancestors ran out, never that the node is
   * shallow.
   */
  ancestors: CategoryOptionDto[];
  options: CategoryOptionDto[];
}

export type PaginatedSearchArticlesDto = PaginatedCatalogArticlesDto & {
  /**
   * The highest page this query can be paged to, which is **not** always
   * `ceil(total / pageSize)`: TecDoc serves only the first ~10,000 results of
   * any match set, and the bound shrinks as the page size grows. A broad query
   * can therefore report millions of matches and still refuse a page past a few
   * hundred, so this is the only safe number to size a pager from.
   */
  maxPage: number;
  facets: SearchFacetDto[];
  attributes: AttributeFacetDto[];
  categoryNavigation: CategoryNavigationDto;
};

/**
 * The `/search` response.
 *
 * The echoed query and the pagination envelope are always sent, so a client can
 * render the result list without guarding them. The four blocks below them are
 * omitted rather than sent empty, which makes their absence the meaningful
 * signal: no facet to narrow by, no sibling categories to drill into, no
 * alternatives worth suggesting. Keep that split — widening the optional four to
 * required would force empty arrays onto every response, and narrowing the
 * required six would put a guard back into every consumer.
 */
export interface SearchResponseDto {
  query: string;
  results: ArticleSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
  /** See {@link PaginatedSearchArticlesDto.maxPage} — size the pager from this. */
  maxPage: number;
  facets?: SearchFacetDto[];
  attributes?: AttributeFacetDto[];
  categoryNavigation?: CategoryNavigationDto;
  suggestions?: AutocompleteItemDto[];
}
