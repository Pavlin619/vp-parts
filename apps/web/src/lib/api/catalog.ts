import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
  DEFAULT_SEARCH_MODE,
  articleIdentityKey,
  type SearchMode,
} from "@vp-parts-shop/shared";
import type {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleIdentityDto,
  ArticlesAvailabilityDto,
  AutocompleteItemDto,
  AlternativeNumberDto,
  LinkedVehicleManufacturerDto,
  LinkedVehicleSeriesDto,
} from "@vp-parts-shop/shared";
import { apiFetch } from "./index";

export function getManufacturers(): Promise<ManufacturerDto[]> {
  return apiFetch<ManufacturerDto[]>("/catalog/manufacturers");
}

export function getModelSeries(manufacturerId: string): Promise<ModelSeriesDto[]> {
  return apiFetch<ModelSeriesDto[]>(
    `/catalog/manufacturers/${manufacturerId}/model-series`,
  );
}

export function getVariants(seriesId: string): Promise<VehicleVariantDto[]> {
  return apiFetch<VehicleVariantDto[]>(
    `/catalog/model-series/${seriesId}/variants`,
  );
}

export function getCategories(vehicleId: string): Promise<AssemblyGroupDto[]> {
  return apiFetch<AssemblyGroupDto[]>(
    `/catalog/vehicles/${vehicleId}/categories`,
  );
}

/**
 * Cacheable catalog metadata for a category page — no live inventory. The grid
 * caches this (stable TecDoc data) and hydrates it with fresh price/stock via
 * {@link getArticlesAvailability}, so a cached page never serves a stale
 * delivery date (mirrors the article detail page's metadata/availability split).
 */
export function getArticlesMetadata(
  vehicleId: string,
  categoryId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedCatalogArticlesDto> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiFetch<PaginatedCatalogArticlesDto>(
    `/catalog/vehicles/${vehicleId}/categories/${categoryId}/articles?${params}`,
  );
}

/**
 * Live price/availability for a batch of articles, keyed by
 * {@link articleIdentityKey}. Never cache — the cached metadata grid calls this
 * per request to attach fresh delivery/stock data. Short-circuits an empty
 * request to skip the round trip.
 *
 * Both halves of the identity are sent because an article number is unique only
 * within a brand: asking by number alone would price one supplier's part from
 * another's stock.
 */
export function getArticlesAvailability(
  articles: ArticleIdentityDto[],
): Promise<ArticlesAvailabilityDto> {
  if (articles.length === 0) {
    return Promise.resolve({});
  }

  const params = new URLSearchParams({
    articles: articles
      .map((article) =>
        articleIdentityKey(article.brandId, article.articleNumber),
      )
      .join(","),
  });

  return apiFetch<ArticlesAvailabilityDto>(
    `/catalog/articles-availability?${params}`,
  );
}

/**
 * The API path identifying one specific article. An article number is unique
 * only within a TecDoc brand (`dataSupplierId`), so both halves are always sent
 * together — a number-only lookup resolves to whichever brand the catalogue
 * happened to sort first.
 */
function articlePath(brandId: string, articleNumber: string): string {
  return `/catalog/brands/${encodeURIComponent(brandId)}/articles/${encodeURIComponent(articleNumber)}`;
}

/**
 * Stable TecDoc catalog metadata only — safe to cache; carries `fitsVehicle`.
 * Live price/availability is fetched separately via {@link getArticlesAvailability}.
 */
export function getArticleCatalogDetail(
  brandId: string,
  articleNumber: string,
  vehicleId?: string,
): Promise<ArticleCatalogDetailDto> {
  const path = articlePath(brandId, articleNumber);
  const params = new URLSearchParams();

  if (vehicleId) {
    params.set("vehicleId", vehicleId);
  }

  const query = params.toString();

  return apiFetch<ArticleCatalogDetailDto>(query ? `${path}?${query}` : path);
}

/**
 * Substitutes fetched per "show more".
 *
 * Kept at or below the availability batch limit, because each page is priced by
 * one availability read of its own numbers.
 */
const SUBSTITUTES_PAGE_SIZE = 20;

/**
 * One page of substitutes — the other brands' parts replacing this one, as
 * cacheable catalog metadata only. Live price/availability is fetched separately
 * via {@link getArticlesAvailability}, mirroring the listing grid's metadata /
 * live-availability split.
 *
 * Paged rather than capped: `total` counts every alternative, so the section can
 * offer them all while a page carries only the rows a visitor has reached. The
 * API orders the whole set by what we can ship before paging it, so page 1 is
 * the part most likely to solve the visitor's problem.
 *
 * Brand-scoped like every article-scoped read: which parts replace a part is a
 * property of that part, and two brands filing one number are two parts.
 */
export function getSubstitutes(
  brandId: string,
  articleNumber: string,
  page = 1,
  pageSize = SUBSTITUTES_PAGE_SIZE,
): Promise<PaginatedCatalogArticlesDto> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  return apiFetch<PaginatedCatalogArticlesDto>(
    `${articlePath(brandId, articleNumber)}/substitutes?${params}`,
  );
}

/**
 * The numbers other brands sell the equivalent part under. Its own read because
 * the catalog response carries only the OE numbers beside them — the
 * alternative-numbers section fetches this when a visitor opens it.
 */
export function getAlternativeNumbers(
  brandId: string,
  articleNumber: string,
): Promise<AlternativeNumberDto[]> {
  return apiFetch<AlternativeNumberDto[]>(
    `${articlePath(brandId, articleNumber)}/alternative-numbers`,
  );
}

/**
 * The makes an article fits. First of two reads that disclose the applicable
 * vehicles: a part fits thousands of modifications, so the vehicles themselves
 * are fetched only once a visitor opens one make.
 */
export function getLinkedManufacturers(
  brandId: string,
  articleNumber: string,
): Promise<LinkedVehicleManufacturerDto[]> {
  return apiFetch<LinkedVehicleManufacturerDto[]>(
    `${articlePath(brandId, articleNumber)}/linked-vehicles/manufacturers`,
  );
}

/**
 * Every vehicle of one make the article fits, grouped into model series. One
 * read rather than a series read and a modifications read below it — the series
 * arrive with their vehicles nested, so expanding one is local state.
 */
export function getLinkedVehiclesByManufacturer(
  brandId: string,
  articleNumber: string,
  manufacturerId: string,
): Promise<LinkedVehicleSeriesDto[]> {
  const params = new URLSearchParams({ manufacturerId });

  return apiFetch<LinkedVehicleSeriesDto[]>(
    `${articlePath(brandId, articleNumber)}/linked-vehicles?${params}`,
  );
}

/**
 * Search itself lives in `./search`; only autocomplete is browser-side.
 *
 * The mode picks the suggestion source, so it must match the mode the search
 * will run in: `generic` yields free-text terms, the part-number modes yield
 * articles and the categories they fall into.
 */
export function getAutocomplete(
  query: string,
  mode: SearchMode = DEFAULT_SEARCH_MODE,
): Promise<AutocompleteItemDto[]> {
  const params = new URLSearchParams({ q: query });

  if (mode !== DEFAULT_SEARCH_MODE) {
    params.set("searchMode", mode);
  }

  return apiFetch<AutocompleteItemDto[]>(`/search/autocomplete?${params}`);
}

// ── TanStack Query option factories ──────────────────────────────────────────
// Define query keys and fetchers here so components never drift out of sync.

export const manufacturersQueryOptions = queryOptions({
  queryKey: ["catalog", "manufacturers"],
  queryFn: getManufacturers,
});

export const modelSeriesQueryOptions = (manufacturerId: string) =>
  queryOptions({
    queryKey: ["catalog", "model-series", manufacturerId],
    queryFn: () => getModelSeries(manufacturerId),
  });

export const variantsQueryOptions = (seriesId: string) =>
  queryOptions({
    queryKey: ["catalog", "variants", seriesId],
    queryFn: () => getVariants(seriesId),
  });

export const categoriesQueryOptions = (vehicleId: string) =>
  queryOptions({
    queryKey: ["catalog", "categories", vehicleId],
    queryFn: () => getCategories(vehicleId),
  });

/**
 * Live price/availability for one or many articles, fetched client-side. Serves
 * every surface — the buy box (a single article), listing grid, search, and
 * substitutes — so identical sets share one cache entry. The key carries brand
 * and number per article and sorts them, so neither order nor a number shared by
 * two brands forks the cache. `staleTime` keeps browse data fresh enough without
 * polling; checkout is the binding re-check.
 */
export const availabilityQueryOptions = (articles: ArticleIdentityDto[]) =>
  queryOptions({
    queryKey: [
      "catalog",
      "availability",
      articles
        .map((article) =>
          articleIdentityKey(article.brandId, article.articleNumber),
        )
        .sort()
        .join(","),
    ],
    queryFn: () => getArticlesAvailability(articles),
    staleTime: 30_000,
  });

export const autocompleteQueryOptions = (
  query: string,
  mode: SearchMode = DEFAULT_SEARCH_MODE,
) =>
  queryOptions({
    // The mode is part of the key: the same term yields different suggestions
    // per mode, so sharing one entry would serve article rows to a free-text
    // search and vice versa.
    queryKey: ["catalog", "autocomplete", mode, query],
    queryFn: () => getAutocomplete(query, mode),
  });

/**
 * How long a read-on-demand catalog-row section's answer stays fresh, and how
 * long it survives with nothing subscribed to it.
 *
 * Pure TecDoc catalog data with no inventory in it, so it ages far more slowly
 * than anything price-bearing. `gcTime` is set alongside `staleTime` rather
 * than left at the app-wide five minutes: these sections unmount the moment
 * they are collapsed, and a five-minute `gcTime` would drop the answer long
 * before it went stale, so closing and reopening one would refetch.
 */
const ROW_SECTION_STALE_TIME = 60 * 60 * 1000;
const ROW_SECTION_GC_TIME = ROW_SECTION_STALE_TIME;

export const linkedManufacturersQueryOptions = (
  brandId: string,
  articleNumber: string,
) =>
  queryOptions({
    queryKey: ["catalog", "linked-manufacturers", brandId, articleNumber],
    queryFn: () => getLinkedManufacturers(brandId, articleNumber),
    staleTime: ROW_SECTION_STALE_TIME,
    gcTime: ROW_SECTION_GC_TIME,
  });

export const linkedVehiclesByMakeQueryOptions = (
  brandId: string,
  articleNumber: string,
  manufacturerId: string,
) =>
  queryOptions({
    queryKey: [
      "catalog",
      "linked-vehicles",
      brandId,
      articleNumber,
      manufacturerId,
    ],
    queryFn: () =>
      getLinkedVehiclesByManufacturer(brandId, articleNumber, manufacturerId),
    staleTime: ROW_SECTION_STALE_TIME,
    gcTime: ROW_SECTION_GC_TIME,
  });

/** The numbers one article's equivalents are sold under, as chips. */
export const alternativeNumbersQueryOptions = (
  brandId: string,
  articleNumber: string,
) =>
  queryOptions({
    queryKey: ["catalog", "alternative-numbers", brandId, articleNumber],
    queryFn: () => getAlternativeNumbers(brandId, articleNumber),
    staleTime: ROW_SECTION_STALE_TIME,
    gcTime: ROW_SECTION_GC_TIME,
  });

/**
 * The same alternatives as {@link alternativeNumbersQueryOptions}, as whole
 * catalog rows rather than numbers, a page at a time.
 *
 * Infinite rather than a pager: this is a section inside a row a visitor already
 * expanded, so replacing the rows they are reading with a different page would
 * lose their place. Each page also stays its own cache entry, which is what keeps
 * one availability read per page inside the batch limit.
 *
 * Keyed on brand and number together, like the read behind it: which parts
 * replace a part is a property of that part, so a number-only key serves one
 * brand's alternatives to the other.
 */
export const substitutesQueryOptions = (
  brandId: string,
  articleNumber: string,
) =>
  infiniteQueryOptions({
    queryKey: ["catalog", "substitutes", brandId, articleNumber],
    queryFn: ({ pageParam }) =>
      getSubstitutes(brandId, articleNumber, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPageOf,
    staleTime: ROW_SECTION_STALE_TIME,
    gcTime: ROW_SECTION_GC_TIME,
  });

/**
 * The page after the one given, or `undefined` when it was the last.
 *
 * Derived from `total` rather than from the page being full: a set whose size is
 * an exact multiple of the page size would otherwise always offer one more page,
 * and that page would come back empty.
 */
function nextPageOf(page: PaginatedCatalogArticlesDto): number | undefined {
  return page.page * page.pageSize < page.total ? page.page + 1 : undefined;
}
