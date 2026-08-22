import { queryOptions } from "@tanstack/react-query";
import { DEFAULT_SEARCH_MODE, type SearchMode } from "@vp-parts-shop/shared";
import type {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
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
 * Live price/availability for a batch of article numbers, keyed by number.
 * Never cache — the cached metadata grid calls this per request to attach fresh
 * delivery/stock data. Short-circuits an empty request to skip the round trip.
 */
export function getArticlesAvailability(
  articleNumbers: string[],
): Promise<ArticlesAvailabilityDto> {
  if (articleNumbers.length === 0) {
    return Promise.resolve({});
  }

  const params = new URLSearchParams({ numbers: articleNumbers.join(",") });
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
 * Cross-reference substitutes — the same part from other brands (TecDoc
 * comparable numbers), as cacheable catalog metadata only. Live
 * price/availability is fetched separately via {@link getArticlesAvailability},
 * mirroring the listing grid's metadata / live-availability split.
 */
export function getSubstitutes(
  articleNumber: string,
): Promise<ArticleSummaryDto[]> {
  return apiFetch<ArticleSummaryDto[]>(
    `/catalog/articles/${encodeURIComponent(articleNumber)}/substitutes`,
  );
}

/**
 * The numbers other brands sell the same part under. Its own read because the
 * catalog response carries only the OE numbers beside them — the
 * alternative-numbers section fetches this when a visitor opens it.
 */
export function getAlternativeNumbers(
  articleNumber: string,
): Promise<AlternativeNumberDto[]> {
  return apiFetch<AlternativeNumberDto[]>(
    `/catalog/articles/${encodeURIComponent(articleNumber)}/alternative-numbers`,
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
 * Live price/availability for one or many article numbers, fetched client-side.
 * Serves every surface — the buy box (`[articleNumber]`), listing grid, search,
 * and substitutes — so identical number sets share one cache entry. The key
 * sorts the numbers so order never forks the cache. `staleTime` keeps browse
 * data fresh enough without polling; checkout is the binding re-check.
 */
export const availabilityQueryOptions = (articleNumbers: string[]) =>
  queryOptions({
    queryKey: ["catalog", "availability", [...articleNumbers].sort().join(",")],
    queryFn: () => getArticlesAvailability(articleNumbers),
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

/** Cross-reference numbers for one article, as chips. */
export const alternativeNumbersQueryOptions = (articleNumber: string) =>
  queryOptions({
    queryKey: ["catalog", "alternative-numbers", articleNumber],
    queryFn: () => getAlternativeNumbers(articleNumber),
    staleTime: ROW_SECTION_STALE_TIME,
    gcTime: ROW_SECTION_GC_TIME,
  });

/**
 * The same cross-references as {@link alternativeNumbersQueryOptions}, as whole
 * catalog rows rather than numbers. Keyed on the number alone, like the read
 * behind it — a comparable-number search takes the number as its query, not as
 * an identity, so there is no brand to key by.
 */
export const substitutesQueryOptions = (articleNumber: string) =>
  queryOptions({
    queryKey: ["catalog", "substitutes", articleNumber],
    queryFn: () => getSubstitutes(articleNumber),
    staleTime: ROW_SECTION_STALE_TIME,
    gcTime: ROW_SECTION_GC_TIME,
  });
