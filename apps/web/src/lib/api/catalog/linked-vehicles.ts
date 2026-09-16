import { queryOptions } from "@tanstack/react-query";
import type {
  LinkedVehicleManufacturerDto,
  LinkedVehicleSeriesDto,
} from "@vp-parts-shop/shared";
import { apiFetch } from "../index";
import { articlePath, ROW_SECTION_CACHE } from "./article-reads";

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

export const linkedManufacturersQueryOptions = (
  brandId: string,
  articleNumber: string,
) =>
  queryOptions({
    queryKey: ["catalog", "linked-manufacturers", brandId, articleNumber],
    queryFn: () => getLinkedManufacturers(brandId, articleNumber),
    ...ROW_SECTION_CACHE,
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
    ...ROW_SECTION_CACHE,
  });
