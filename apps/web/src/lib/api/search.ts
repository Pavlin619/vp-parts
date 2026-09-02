import "server-only";
import { headers } from "next/headers";
import {
  DEFAULT_SEARCH_MODE,
  DEFAULT_SEARCH_SORT,
  FORWARDED_FOR_HEADER,
  WEB_ORIGIN_TOKEN_HEADER,
  type AttributeSelectionDto,
  type SearchMode,
  type SearchResponseDto,
  type SearchSort,
  type StockScope,
} from "@vp-parts-shop/shared";
import { apiFetch } from "./index";

export interface SearchArticlesParams {
  query: string;
  vehicleId?: string;
  page?: number;
  pageSize?: number;
  mode?: SearchMode;
  /** TecDoc dataSupplierIds echoed back from the brand facet. */
  brandIds?: string[];
  /** TecDoc genericArticleIds echoed back from the product-type facet. */
  productTypeIds?: string[];
  /** The single selected assemblyGroupNodeId — category drill-down is one path. */
  categoryNodeId?: string;
  /**
   * `hasChildren` of {@link SearchArticlesParams.categoryNodeId}. The API only
   * computes the technical-attribute facets when this is explicitly `false`, so
   * leaving it out is how a caller declines to be charged for them.
   */
  categoryHasChildren?: boolean;
  attributes?: AttributeSelectionDto[];
  /**
   * Narrow to one stock origin. Honoured only on a match set narrow enough for
   * the API to have ranked — a wider one comes back unnarrowed, and says so by
   * carrying no `stockScopeCounts`.
   */
  stockScope?: StockScope;
  /**
   * Which order to serve the results in. An order that ranks on stock cannot be
   * honoured on a set too wide to enumerate; the response reports what it fell
   * back to in `ordering` rather than failing.
   */
  sort?: SearchSort;
}

/**
 * Kept out of `catalog.ts` because it is the one catalog read the browser never
 * makes itself. Being server-rendered it reaches the API as *us* rather than as
 * the visitor, so it needs request context — and therefore a secret and
 * `next/headers`, neither of which may follow it into a client bundle.
 */
export async function searchArticles(
  params: SearchArticlesParams,
): Promise<SearchResponseDto> {
  return apiFetch<SearchResponseDto>(`/search?${searchQueryString(params)}`, {
    headers: await clientAttributionHeaders(),
  });
}

/**
 * Builds the `/search` query string. The repeatable params are appended once
 * per value rather than comma-joined, which is the shape the API's DTO
 * transforms expect. Defaults are left off so two equivalent searches produce
 * one URL — and therefore one Redis entry — instead of several.
 */
function searchQueryString(params: SearchArticlesParams): URLSearchParams {
  const query = new URLSearchParams({ q: params.query });

  if (params.vehicleId) {
    query.set("vehicleId", params.vehicleId);
  }

  if (params.page !== undefined && params.page > 1) {
    query.set("page", String(params.page));
  }

  if (params.pageSize !== undefined) {
    query.set("pageSize", String(params.pageSize));
  }

  if (params.mode !== undefined && params.mode !== DEFAULT_SEARCH_MODE) {
    query.set("searchMode", params.mode);
  }

  for (const brandId of params.brandIds ?? []) {
    query.append("brandIds", brandId);
  }

  for (const productTypeId of params.productTypeIds ?? []) {
    query.append("productTypeIds", productTypeId);
  }

  if (params.categoryNodeId !== undefined) {
    query.set("categoryNodeId", params.categoryNodeId);

    // Only meaningful alongside a category: on its own it describes nothing,
    // and an absent hint is how the API is told to skip the attribute facets.
    if (params.categoryHasChildren !== undefined) {
      query.set("categoryHasChildren", String(params.categoryHasChildren));
    }
  }

  for (const attribute of params.attributes ?? []) {
    query.append("attr", `${attribute.criteriaId}:${attribute.value}`);
  }

  if (params.stockScope !== undefined) {
    query.set("stock", params.stockScope);
  }

  if (params.sort !== undefined && params.sort !== DEFAULT_SEARCH_SORT) {
    query.set("sort", params.sort);
  }

  return query;
}

/**
 * Tells the API which visitor this call is for. Without it every server-side
 * search is attributed to a Vercel egress address and the whole site shares one
 * rate-limit allowance; the token is what makes the API believe the address
 * rather than treating it as a header anyone could have written. Both or
 * neither — an unvouched-for address is ignored downstream.
 *
 * Never call from a `'use cache'` function: `headers()` throws in a cache scope.
 */
async function clientAttributionHeaders(): Promise<Record<string, string>> {
  const token = process.env.WEB_ORIGIN_TOKEN;

  if (!token) {
    return {};
  }

  const forwardedFor = (await headers()).get(FORWARDED_FOR_HEADER);

  if (!forwardedFor) {
    return {};
  }

  return {
    [FORWARDED_FOR_HEADER]: forwardedFor,
    [WEB_ORIGIN_TOKEN_HEADER]: token,
  };
}
