import { queryOptions } from "@tanstack/react-query";
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
  LinkedVehicleDto,
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
 * The vehicles an article fits. Its own read because no list surface shows them
 * — the applicable-vehicles section fetches this when a visitor opens it, so a
 * part with hundreds of linkages costs nothing until someone asks.
 */
export function getLinkedVehicles(
  brandId: string,
  articleNumber: string,
): Promise<LinkedVehicleDto[]> {
  return apiFetch<LinkedVehicleDto[]>(
    `${articlePath(brandId, articleNumber)}/linked-vehicles`,
  );
}

/** Search itself lives in `./search`; only autocomplete is browser-side. */
export function getAutocomplete(query: string): Promise<AutocompleteItemDto[]> {
  return apiFetch<AutocompleteItemDto[]>(
    `/search/autocomplete?${new URLSearchParams({ q: query })}`,
  );
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

export const autocompleteQueryOptions = (query: string) =>
  queryOptions({
    queryKey: ["catalog", "autocomplete", query],
    queryFn: () => getAutocomplete(query),
  });

/**
 * Applicable vehicles for one article. Pure TecDoc catalog data with no
 * inventory in it, so it stays fresh far longer than anything price-bearing —
 * long enough that reopening the section, or opening it on another row for the
 * same part, never refetches.
 */
export const linkedVehiclesQueryOptions = (
  brandId: string,
  articleNumber: string,
) =>
  queryOptions({
    queryKey: ["catalog", "linked-vehicles", brandId, articleNumber],
    queryFn: () => getLinkedVehicles(brandId, articleNumber),
    staleTime: 60 * 60 * 1000,
  });

/**
 * Cross-reference numbers for one article. Pure TecDoc catalog data with no
 * inventory in it, so it stays fresh as long as the linkages above — long
 * enough that reopening the section, or opening it on another row for the same
 * part, never refetches.
 */
export const alternativeNumbersQueryOptions = (articleNumber: string) =>
  queryOptions({
    queryKey: ["catalog", "alternative-numbers", articleNumber],
    queryFn: () => getAlternativeNumbers(articleNumber),
    staleTime: 60 * 60 * 1000,
  });
