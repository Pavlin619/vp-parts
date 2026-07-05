import { queryOptions } from "@tanstack/react-query";
import type {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedArticlesDto,
  ArticleCatalogDetailDto,
  ArticleDetailDto,
  ArticleDetailSection,
  ArticleInventoryDetailDto,
  SearchResponseDto,
  AutocompleteItemDto,
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

export function listArticles(
  vehicleId: string,
  categoryId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedArticlesDto> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiFetch<PaginatedArticlesDto>(
    `/catalog/vehicles/${vehicleId}/categories/${categoryId}/articles?${params}`,
  );
}

/**
 * Builds the article detail URL for the requested sections. `include` selects
 * which halves the backend assembles: `details` (cacheable TecDoc metadata),
 * `availability` (live price/stock), or both.
 */
function articleDetailPath(
  articleNumber: string,
  include: ArticleDetailSection[],
  vehicleId?: string,
): string {
  const params = new URLSearchParams();
  if (vehicleId) {
    params.set("vehicleId", vehicleId);
  }
  params.set("include", include.join(","));
  return `/catalog/articles/${encodeURIComponent(articleNumber)}?${params}`;
}

/** Stable TecDoc catalog metadata only — safe to cache; carries `fitsVehicle`. */
export function getArticleCatalogDetail(
  articleNumber: string,
  vehicleId?: string,
): Promise<ArticleCatalogDetailDto> {
  return apiFetch<ArticleCatalogDetailDto>(
    articleDetailPath(articleNumber, ["details"], vehicleId),
  );
}

/**
 * Live price/stock only — never cache. Vehicle-independent, so no `vehicleId`
 * is sent (fit is a catalog concern fetched via {@link getArticleCatalogDetail}).
 */
export function getArticleAvailability(
  articleNumber: string,
): Promise<ArticleInventoryDetailDto> {
  return apiFetch<ArticleInventoryDetailDto>(
    articleDetailPath(articleNumber, ["availability"]),
  );
}

/** Full detail — catalog metadata plus live inventory in one round trip. */
export function getArticleDetail(
  articleNumber: string,
  vehicleId?: string,
): Promise<ArticleDetailDto> {
  return apiFetch<ArticleDetailDto>(
    articleDetailPath(articleNumber, ["details", "availability"], vehicleId),
  );
}

export function searchByPartNumber(
  query: string,
  vehicleId?: string,
): Promise<SearchResponseDto> {
  const params = new URLSearchParams({ q: query });
  if (vehicleId) {
    params.set("vehicleId", vehicleId);
  }
  return apiFetch<SearchResponseDto>(`/search?${params}`);
}

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

export const articleDetailQueryOptions = (articleNumber: string, vehicleId?: string) =>
  queryOptions({
    queryKey: ["catalog", "articles", articleNumber, vehicleId ?? null],
    queryFn: () => getArticleDetail(articleNumber, vehicleId),
  });

export const autocompleteQueryOptions = (query: string) =>
  queryOptions({
    queryKey: ["catalog", "autocomplete", query],
    queryFn: () => getAutocomplete(query),
  });
