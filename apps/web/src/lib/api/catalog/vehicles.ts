import { queryOptions } from "@tanstack/react-query";
import type {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
} from "@vp-parts-shop/shared";
import { apiFetch } from "../index";

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
