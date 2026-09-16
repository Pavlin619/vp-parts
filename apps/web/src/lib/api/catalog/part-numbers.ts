import { queryOptions } from "@tanstack/react-query";
import type { ArticlePartNumbersDto } from "@vp-parts-shop/shared";
import { apiFetch } from "../index";
import { articlePath, ROW_SECTION_CACHE } from "./article-reads";

/**
 * Every number a part can be ordered by: the vehicle makers' OE numbers and the
 * numbers other brands sell the equivalent under. Its own read because no list
 * response carries either — OE numbers are the bulkiest field on an article —
 * so the numbers section fetches both when a visitor opens it.
 */
export function getPartNumbers(
  brandId: string,
  articleNumber: string,
): Promise<ArticlePartNumbersDto> {
  return apiFetch<ArticlePartNumbersDto>(
    `${articlePath(brandId, articleNumber)}/part-numbers`,
  );
}

/** Every number one article can be ordered by, as chips. */
export const partNumbersQueryOptions = (
  brandId: string,
  articleNumber: string,
) =>
  queryOptions({
    queryKey: ["catalog", "part-numbers", brandId, articleNumber],
    queryFn: () => getPartNumbers(brandId, articleNumber),
    ...ROW_SECTION_CACHE,
  });
