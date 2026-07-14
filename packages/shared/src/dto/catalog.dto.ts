import { WarehouseAvailabilityDto } from './inventory.dto';

export interface ManufacturerDto {
  id: string;
  name: string;
}

/**
 * A parts brand (TecDoc data supplier) with its logo. The logo comes from the
 * TecDoc `getBrands` function (`dataSupplierLogo.imageURL*`); it is `null` when
 * TecDoc has no logo on file for that brand.
 */
export interface BrandDto {
  brandName: string;
  logoUrl: string | null;
}

export interface ModelSeriesDto {
  id: string;
  manufacturerId: string;
  name: string;
}

export interface VehicleVariantDto {
  vehicleId: string;
  seriesId: string;
  name: string;
  yearFrom: number;
  yearTo: number | null;
  engine: string;
  powerKw: number;
  fuelType: string;
  bodyType: string;
}

export interface AssemblyGroupDto {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Inventory summary shown next to a catalog article in lists/grids. The catalog
 * layer (TecDoc) owns none of this; the inventory layer adds it on top of the
 * catalog metadata below.
 */
export interface ArticleInventorySummaryDto {
  available: boolean;
  bestPriceExVat: number | null;
  bestPriceIncVat: number | null;
}

/**
 * The single catalog metadata shape TecDoc owns for an article row, shared by
 * every list surface — category listing, search, and substitutes — and extended
 * by the article detail DTO. It carries identity, brand (+ logo), description,
 * thumbnail, and the technical specs / OE numbers that ride along free on the
 * same `getArticles` (`includeAll`) response, plus the vehicle-fit flag. It
 * holds **no** live inventory: every surface fetches price/availability
 * separately and merges it in, so cached metadata never carries a stale
 * delivery date. Compatible vehicles are intentionally excluded here — they
 * require a separate per-article TecDoc lookup and live on the detail DTO.
 */
export interface ArticleSummaryDto {
  articleNumber: string;
  brandName: string;
  /** Brand logo URL from TecDoc `getBrands`, or `null` when none is on file. */
  brandLogoUrl: string | null;
  description: string;
  thumbnailUrl: string | null;
  technicalSpecs: TechnicalSpecDto[];
  oemNumbers: string[];
  /** `true`/`false` when a vehicle is scoped for the request, else `null`. */
  fitsVehicle: boolean | null;
}

/**
 * A catalog summary enriched with the *full* live inventory detail — price,
 * availability, and the per-warehouse breakdown — so every list surface (grid,
 * search, substitutes) can feed the same row component. Because it carries
 * request-time warehouse delivery dates it must only come from **dynamic
 * (uncached)** responses; cached listings serve the metadata-only
 * `ArticleSummaryDto` and fetch this availability live and separately (see the
 * article detail page's cached-metadata / live-availability split).
 */
export interface ArticleListItemDto
  extends ArticleSummaryDto,
    ArticleInventoryDetailDto {}

export interface PaginatedDto<TItem> {
  total: number;
  page: number;
  pageSize: number;
  items: TItem[];
}

export type PaginatedCatalogArticlesDto = PaginatedDto<ArticleSummaryDto>;
export type PaginatedArticlesDto = PaginatedDto<ArticleListItemDto>;

/**
 * A single selectable value inside a search facet (one brand), with the count
 * of matching articles for the current query. `id` is the value the client
 * sends back to filter (a TecDoc dataSupplierId); `label` is the display name.
 * `imageUrl` carries the brand logo (joined from TecDoc `getBrands`).
 */
export interface FacetValueDto {
  id: string;
  label: string;
  count: number;
  imageUrl?: string | null;
}

/**
 * A group of facet values the user can filter a search by. Computed by TecDoc
 * over the whole matching set (not just the current page) and returned
 * alongside the paginated results. Categories are carried separately as
 * {@link CategoryNavigationDto} (single-level drill-down), so this group is
 * brand-only.
 */
export interface SearchFacetDto {
  id: 'brands';
  label: string;
  values: FacetValueDto[];
}

/**
 * A single selectable value inside a technical-attribute (criteria) facet. TecDoc
 * distinguishes the machine `value` (rawValue — echoed back as the filter value)
 * from the human `label` (formattedValue, e.g. "106.4" or "Отпред").
 */
export interface AttributeFacetValueDto {
  value: string;
  label: string;
  count: number;
}

/**
 * A semantic role the client can special-case with a dedicated control instead
 * of the generic value list — e.g. rendering `fitting-position` (front/rear) as
 * a car diagram or segmented toggle, as InterCars does. Assigned on the backend
 * from a known map of TecDoc criteriaIds so the client never hard-codes them.
 * `null`/absent means "render as a normal attribute facet".
 */
export type AttributeFacetRole = 'fitting-position' | 'axle' | 'side';

/**
 * One technical-attribute facet group over the match set (e.g. "Ширина",
 * "Позиция на монтаж"), keyed by the TecDoc criteriaId. `unit` and `type` come
 * from TecDoc so the UI can render numeric attributes differently from enum ones
 * (criteriaType: 'N' numeric, 'A' alphanumeric, 'K' key/lookup, etc.). `role`
 * flags well-known criteria (e.g. fitting position) for a bespoke control.
 */
export interface AttributeFacetDto {
  id: string;
  label: string;
  unit?: string | null;
  type: string;
  isInterval: boolean;
  role?: AttributeFacetRole | null;
  values: AttributeFacetValueDto[];
}

/**
 * One selectable category in the search's single-level navigation — a node the
 * user can click to drill one level deeper (a root enters that branch). `id` is
 * the assemblyGroupNodeId (sent back as the `categoryNodeId` filter). `count` is
 * the match count in the current scope (null when TecDoc omits it). `hasChildren`
 * tells the UI whether clicking drills deeper or lands on a leaf (where the
 * dimension `attributes` appear).
 */
export interface CategoryOptionDto {
  id: string;
  label: string;
  count: number | null;
  hasChildren: boolean;
}

/**
 * The category facet as **single-level navigation** rather than a full tree, so
 * the UI drills one step at a time (like InterCars): render `options`, the user
 * clicks one, the search is re-issued with that `categoryNodeId`, and the next
 * level comes back re-scoped. A broad search therefore returns only the top-level
 * roots — never the whole tree for every matched branch. There is no breadcrumb:
 * each drill level is a distinct search URL, so the browser back button covers
 * "go up".
 * - `options` — the level to choose from: the roots when nothing is selected,
 *   otherwise the current node's immediate children (empty once at a leaf).
 * - `current` — the selected node (its `hasChildren` also drives the leaf gate
 *   for `attributes`, and its `label`/`count` feed the results heading), or
 *   `null` on a broad/unscoped search.
 */
export interface CategoryNavigationDto {
  current: CategoryOptionDto | null;
  options: CategoryOptionDto[];
}

/**
 * Paginated search hits plus everything computed over the full match set: the
 * brand facet, the technical-attribute facets, and the hierarchical category
 * tree. Search-specific: the plain catalogue listing
 * ({@link PaginatedCatalogArticlesDto}) carries none of these.
 */
export type PaginatedSearchArticlesDto = PaginatedCatalogArticlesDto & {
  facets: SearchFacetDto[];
  attributes: AttributeFacetDto[];
  categoryNavigation: CategoryNavigationDto;
};

/**
 * Live price/availability for a batch of articles, keyed by article number.
 * Returned by the uncached bulk-availability endpoint that a cached listing
 * grid calls to hydrate its metadata rows with fresh delivery/stock data. A
 * requested number is absent from the map only when it has no inventory row.
 */
export type ArticlesAvailabilityDto = Record<string, ArticleInventoryDetailDto>;

export interface TechnicalSpecDto {
  key: string;
  value: string;
}

export interface CompatibleVehicleDto {
  vehicleId: string;
  name: string;
}

/**
 * Richer inventory data shown on the article detail page: the per-warehouse
 * availability breakdown, which carries the delivery projection the UI renders.
 */
export interface ArticleInventoryDetailDto extends ArticleInventorySummaryDto {
  /** Available quantity per customer-facing warehouse, fastest first. */
  availabilityByWarehouse: WarehouseAvailabilityDto[];
  /**
   * Absolute instant (ISO UTC) the warehouse dates were computed, or null on
   * cached paths that omit them. Drives client-side staleness detection.
   */
  computedAt: string | null;
}

/**
 * Catalog metadata TecDoc owns for a single article — the shared
 * {@link ArticleSummaryDto} plus the detail-only image gallery and the
 * compatible-vehicle list (populated by a separate per-article TecDoc lookup;
 * empty until that fitment feature lands).
 */
export interface ArticleCatalogDetailDto extends ArticleSummaryDto {
  images: string[];
  compatibleVehicles: CompatibleVehicleDto[];
}

export interface SearchResponseDto {
  query?: string;
  /**
   * Search hits as cacheable {@link ArticleSummaryDto} metadata (identity,
   * brand, specs/OE, thumbnail, and fit) with **no** live inventory. Mirrors
   * the listing grid / article detail split: the client fetches live
   * price/availability separately via {@link ArticlesAvailabilityDto} and
   * merges it in. The search always returns a list (even for a single hit) so
   * the user stays on the results screen; article navigation happens from
   * autocomplete, not from the search response.
   */
  results?: ArticleSummaryDto[];
  /**
   * Pagination metadata for {@link results}. `total` is the count reported by
   * the winning search tier, so the client can render the page controls. All
   * three are present together whenever `results` is.
   */
  total?: number;
  page?: number;
  pageSize?: number;
  /**
   * Brand facet group for {@link results}, computed by TecDoc over the whole
   * match set. Present (and non-empty) only when there are results to filter;
   * absent on a zero-result response.
   */
  facets?: SearchFacetDto[];
  /**
   * Technical-attribute (criteria) facets for {@link results} — the "brake
   * system", "width", "mounting position"… groups the UI renders. Present only
   * once the search has landed on a **leaf** category (the deepest tree node);
   * a broad, multi-category search omits them because criteria are defined per
   * product type and would otherwise be an incoherent cross-category mix.
   */
  attributes?: AttributeFacetDto[];
  /**
   * Single-level category navigation for {@link results} — the current level's
   * `options` and the `current` node — so the UI drills one step at a time and
   * re-issues the search per click. Same lifecycle as {@link facets}.
   */
  categoryNavigation?: CategoryNavigationDto;
  suggestions?: AutocompleteItemDto[];
}

/**
 * A single autocomplete suggestion. The shape depends on the search type the
 * user picked on the FE (mirrors the search's mode), discriminated by `kind`:
 * - `article` — a concrete part (part-number / exact search). Selecting it
 *   navigates straight to that article's detail page.
 * - `term` — a free-text search term (generic search). Selecting it re-runs a
 *   generic search for that term rather than deep-linking to one article.
 */
export type AutocompleteItemDto =
  | ArticleAutocompleteItemDto
  | TermAutocompleteItemDto;

/**
 * A part-number/exact autocomplete hit: a concrete article the FE deep-links to
 * (`/catalog/articles/{articleNumber}`). Sourced from TecDoc `getArticles`.
 */
export interface ArticleAutocompleteItemDto {
  kind: 'article';
  articleNumber: string;
  brandName: string;
  description: string;
}

/**
 * A generic (free-text) autocomplete hit: a search term the FE re-runs as a
 * generic search. Sourced from TecDoc `getAutoCompleteSuggestions`, which
 * returns article/manufacturer/assembly-group descriptions for the typed
 * string.
 */
export interface TermAutocompleteItemDto {
  kind: 'term';
  term: string;
}
