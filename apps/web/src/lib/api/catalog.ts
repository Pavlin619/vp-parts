import { queryOptions } from "@tanstack/react-query";
import type {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedArticlesDto,
  ArticleDetailDto,
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

export function getArticleDetail(
  articleNumber: string,
  vehicleId?: string,
): Promise<ArticleDetailDto> {
  const search = vehicleId ? `?${new URLSearchParams({ vehicleId })}` : "";
  return apiFetch<ArticleDetailDto>(
    `/catalog/articles/${encodeURIComponent(articleNumber)}${search}`,
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
