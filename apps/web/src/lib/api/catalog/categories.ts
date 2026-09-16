import { queryOptions } from "@tanstack/react-query";
import type { AssemblyGroupDto } from "@vp-parts-shop/shared";
import { apiFetch } from "../index";

/**
 * The catalogue-wide category tree — every category that holds parts, counted
 * over the whole catalogue rather than one car. What the homepage reads, and
 * what the catalogue page reads while no car is picked; the API answers it from
 * a single shared cache entry.
 */
export function getCatalogCategories(): Promise<AssemblyGroupDto[]> {
  return apiFetch<AssemblyGroupDto[]>("/catalog/categories");
}

export function getCategories(vehicleId: string): Promise<AssemblyGroupDto[]> {
  return apiFetch<AssemblyGroupDto[]>(
    `/catalog/vehicles/${vehicleId}/categories`,
  );
}

/**
 * Sentinel for the catalogue-wide tree's cache entry. Cannot collide with a
 * vehicle id, which TecDoc always numbers.
 */
const CATALOGUE_WIDE = "catalogue";

/**
 * The tree the catalogue page renders: one car's categories, or the whole
 * catalogue's when no car is picked. One factory rather than two so the page
 * switches trees by passing a different argument, while the two answers stay
 * separate cache entries — a car's subset must never be served as the
 * catalogue, nor the other way round.
 */
export const categoriesQueryOptions = (vehicleId?: string) =>
  queryOptions({
    queryKey: ["catalog", "categories", vehicleId ?? CATALOGUE_WIDE],
    queryFn: () =>
      vehicleId ? getCategories(vehicleId) : getCatalogCategories(),
  });
