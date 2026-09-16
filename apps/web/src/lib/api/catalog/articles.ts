import type { ArticleCatalogDetailDto } from "@vp-parts-shop/shared";
import { apiFetch } from "../index";
import { articlePath } from "./article-reads";

/**
 * Stable TecDoc catalog metadata only — safe to cache; carries `fitsVehicle`.
 * Live price/availability is fetched separately via `getArticlesAvailability`.
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
