import { Injectable, Logger } from '@nestjs/common';
export type SearchMatchType =
  | 'exact'
  | 'prefix'
  | 'suffix'
  | 'prefix_or_suffix';

/**
 * Optional narrowing a caller applies to a search, selected from the facet
 * values returned on a previous search. `brandIds` are TecDoc dataSupplierIds
 * and `categoryIds` are genericArticleIds — the `id` fields of the facet values
 * the UI presents. Both are AND-combined; each is OR-combined within itself.
 */
export interface SearchFilters {
  brandIds?: string[];
  categoryIds?: string[];
}

import { ConfigService } from '@nestjs/config';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  BrandDto,
  PaginatedCatalogArticlesDto,
  PaginatedSearchArticlesDto,
  SearchFacetDto,
  FacetValueDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  AutocompleteItemDto,
} from '@vp-parts-shop/shared';

/**
 * The subset of a TecDoc `getArticles` (`includeAll: true`) article record the
 * catalog surfaces consume. One shape backs the listing, search, substitutes,
 * and detail responses — they only differ in how the articles are selected.
 */
interface TecDocArticleRecord {
  articleNumber: string;
  mfrName: string;
  genericArticles?: Array<{ genericArticleDescription?: string }>;
  images?: Array<{ imageURL800?: string }>;
  articleCriteria?: Array<{
    criteriaDescription: string;
    formattedValue: string;
  }>;
  oemNumbers?: Array<{ articleNumber: string }>;
}

/**
 * Upper bound on comparable (cross-reference) articles fetched and returned for
 * a single part. Caps the TecDoc `getArticles` page size and the enriched list
 * so a part with hundreds of cross-references never floods the substitutes tab
 * or the bulk inventory lookup behind it.
 */
export const SUBSTITUTES_LIMIT = 20;

/**
 * TecDoc Pegasus 3.0 is a JSON RPC service — NOT a REST API.
 *
 * All calls are HTTP POST to a single endpoint:
 *   {TECDOC_BASE_URL}/services/TecdocToCatDLB.jsonEndpoint
 *
 * Every request body is a JSON object keyed by the function name:
 *   { "getFunctionName": { "provider": PROVIDER_ID, ...params } }
 *
 * The provider field is mandatory on every call. It is the ProviderId
 * assigned by TecAlliance during onboarding.
 *
 * Full API contract and interactive test client:
 *   https://webservice.tecalliance.services/pegasus-3-0/info/
 */
@Injectable()
export class TecDocClient {
  private readonly logger = new Logger(TecDocClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly providerId: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('TECDOC_BASE_URL')!;
    this.apiKey = this.config.get<string>('TECDOC_API_KEY')!;
    this.providerId = Number(this.config.get<string>('TECDOC_PROVIDER_ID'));
  }

  async getManufacturers(): Promise<ManufacturerDto[]> {
    const data = await this.call<{
      mfrFacets: { counts: Array<{ id: number; name: string }> };
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: 'P',
      perPage: 0,
      page: 1,
      includeMfrFacets: true,
    });

    return data.mfrFacets.counts.map((c) => ({
      id: String(c.id),
      name: c.name,
    }));
  }

  async getModelSeries(manufacturerId: string): Promise<ModelSeriesDto[]> {
    const data = await this.call<{
      vehicleModelSeriesFacets: { counts: Array<{ id: number; name: string }> };
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: 'P',
      mfrIds: Number(manufacturerId),
      perPage: 0,
      page: 1,
      includeVehicleModelSeriesFacets: true,
    });

    return data.vehicleModelSeriesFacets.counts.map((c) => ({
      id: String(c.id),
      manufacturerId,
      name: c.name,
    }));
  }

  async getVehicleTypes(seriesId: string): Promise<VehicleVariantDto[]> {
    const data = await this.call<{
      linkageTargets: Array<{
        linkageTargetId: number;
        vehicleModelSeriesId: number;
        description: string;
        beginYearMonth: string;
        endYearMonth: string | null;
        engines: Array<{ code: string }>;
        kiloWattsFrom: number;
        fuelType: string;
        bodyStyle: string;
      }>;
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: 'P',
      vehicleModelSeriesIds: Number(seriesId),
      perPage: 100,
      page: 1,
    });

    return data.linkageTargets.map((v) => ({
      vehicleId: String(v.linkageTargetId),
      seriesId: String(v.vehicleModelSeriesId),
      name: v.description,
      yearFrom: parseInt(v.beginYearMonth.split('-')[0], 10),
      yearTo: v.endYearMonth
        ? parseInt(v.endYearMonth.split('-')[0], 10)
        : null,
      engine: v.engines[0]?.code ?? '',
      powerKw: v.kiloWattsFrom,
      fuelType: v.fuelType,
      bodyType: v.bodyStyle,
    }));
  }

  async getAssemblyGroupTree(vehicleId: string): Promise<AssemblyGroupDto[]> {
    const data = await this.call<{
      assemblyGroupFacets: {
        counts: Array<{
          assemblyGroupNodeId: number;
          assemblyGroupName: string;
          parentNodeId: number | null;
        }>;
      };
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      perPage: 0,
      page: 1,
      assemblyGroupFacetOptions: {
        enabled: true,
        assemblyGroupType: 'P',
        includeCompleteTree: true,
      },
      linkageTargetType: 'P',
      linkageTargetId: Number(vehicleId),
    });

    return data.assemblyGroupFacets.counts.map((g) => ({
      id: String(g.assemblyGroupNodeId),
      name: g.assemblyGroupName,
      parentId: g.parentNodeId != null ? String(g.parentNodeId) : null,
    }));
  }

  /**
   * All parts brands with their logo URLs. TecDoc keys articles by brand name
   * (`mfrName`), not by logo, so the brand→logo join happens in the catalog
   * layer. `includeAll` makes TecDoc attach the `dataSupplierLogo` block; we
   * pick a mid-resolution image and fall back through the other sizes.
   */
  async getBrands(): Promise<BrandDto[]> {
    const data = await this.call<{
      data: {
        array: Array<{
          mfrName: string;
          dataSupplierLogo?: {
            imageURL100?: string;
            imageURL200?: string;
            imageURL400?: string;
            imageURL800?: string;
          };
        }>;
      };
    }>('getBrands', {
      articleCountry: 'BG',
      lang: 'bg',
      includeAll: true,
    });

    return data.data.array.map((brand) => ({
      brandName: brand.mfrName,
      logoUrl:
        brand.dataSupplierLogo?.imageURL200 ??
        brand.dataSupplierLogo?.imageURL400 ??
        brand.dataSupplierLogo?.imageURL100 ??
        brand.dataSupplierLogo?.imageURL800 ??
        null,
    }));
  }

  async getArticles(
    vehicleId: string,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    const data = await this.call<{
      totalMatchingArticles: number;
      articles: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      assemblyGroupNodeIds: Number(categoryId),
      linkageTargetType: 'P',
      linkageTargetId: Number(vehicleId),
      perPage: pageSize,
      page,
      includeAll: true,
    });

    return {
      total: data.totalMatchingArticles,
      page,
      pageSize,
      items: data.articles.map((article) => this.mapArticleSummary(article)),
    };
  }

  async getArticleDetails(
    articleNumber: string,
    // Reserved for the future per-vehicle fit lookup; fit is null until then.
    _vehicleId?: string,
  ): Promise<ArticleCatalogDetailDto> {
    const data = await this.call<{
      articles: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: articleNumber,
      searchType: 0,
      includeAll: true,
      perPage: 1,
      page: 1,
    });

    if (!data.articles || data.articles.length === 0) {
      throw new Error(`Article not found: ${articleNumber}`);
    }

    const article = data.articles[0];

    return {
      // The row summary (identity, brand, description, thumbnail, specs, OE)
      // is shared with every list surface; the detail adds the image gallery.
      ...this.mapArticleSummary(article),
      images: (article.images ?? [])
        .map((img) => img.imageURL800 ?? '')
        .filter(Boolean),
      // Compatible vehicles require a separate getArticleLinkedAllLinkingTarget4
      // call sequence — see TecDoc docs section 8.4. Populated by a future task.
      compatibleVehicles: [],
    };
  }

  /**
   * Comparable (cross-reference) articles for a part — "the same part from
   * other data suppliers". Uses `getArticles` with `searchType: 3` (Comparable
   * Number, per the Pegasus 3.0 Onboarding Guide §8.5: "comparable articles
   * that can replace each other from different data suppliers"). The searched
   * article is excluded and duplicates are removed; the page size is capped at
   * {@link SUBSTITUTES_LIMIT}.
   */
  async getSubstitutes(articleNumber: string): Promise<ArticleSummaryDto[]> {
    const data = await this.call<{
      articles?: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: articleNumber,
      searchType: 3,
      perPage: SUBSTITUTES_LIMIT,
      page: 1,
      includeAll: true,
    });

    const seen = new Set<string>([articleNumber]);
    const substitutes: ArticleSummaryDto[] = [];

    for (const article of data.articles ?? []) {
      if (seen.has(article.articleNumber)) continue;
      seen.add(article.articleNumber);

      substitutes.push(this.mapArticleSummary(article));
    }

    return substitutes;
  }

  /**
   * Free-text/number search (searchType 10 — "any number"). Asks TecDoc for the
   * brand (`dataSupplier`) and category (`genericArticle`) facet counts over the
   * whole match set so the UI can narrow a broad query, and forwards any active
   * facet selections as `dataSupplierIds` / `genericArticleIds` filters.
   */
  async searchArticles(
    query: string,
    vehicleId?: string,
    matchType: SearchMatchType = 'prefix_or_suffix',
    page = 1,
    pageSize = 50,
    filters?: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    const data = await this.call<{
      totalMatchingArticles: number;
      articles: TecDocArticleRecord[];
      dataSupplierFacets?: {
        counts: Array<{
          dataSupplierId: number;
          mfrName: string;
          count: number;
        }>;
      };
      genericArticleFacets?: {
        counts: Array<{
          genericArticleId: number;
          genericArticleDescription: string;
          count: number;
        }>;
      };
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: query,
      searchType: 10,
      searchMatchType: matchType,
      perPage: pageSize,
      page,
      includeAll: true,
      includeDataSupplierFacets: true,
      includeGenericArticleFacets: true,
      ...(vehicleId != null && {
        linkageTargetType: 'P',
        linkageTargetId: Number(vehicleId),
      }),
      ...(filters?.brandIds?.length && {
        dataSupplierIds: filters.brandIds.map(Number),
      }),
      ...(filters?.categoryIds?.length && {
        genericArticleIds: filters.categoryIds.map(Number),
      }),
    });

    return {
      total: data.totalMatchingArticles,
      page,
      pageSize,
      items: (data.articles ?? []).map((article) =>
        this.mapArticleSummary(article),
      ),
      facets: this.mapSearchFacets(
        data.dataSupplierFacets?.counts,
        data.genericArticleFacets?.counts,
      ),
    };
  }

  async getAutocompleteSuggestions(
    query: string,
  ): Promise<AutocompleteItemDto[]> {
    const data = await this.call<{
      totalMatchingArticles: number;
      articles: Array<{
        articleNumber: string;
        mfrName: string;
        genericArticles: Array<{ genericArticleDescription: string }>;
      }>;
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: query,
      searchType: 10,
      searchMatchType: 'prefix',
      perPage: 8,
      page: 1,
    });

    return data.articles.map((a) => ({
      articleNumber: a.articleNumber,
      brandName: a.mfrName,
      description: a.genericArticles[0]?.genericArticleDescription ?? '',
    }));
  }

  /**
   * Maps a raw TecDoc `getArticles` article into the shared summary shape every
   * list surface renders. Technical specs (`articleCriteria`) and OE numbers
   * ride along free on the same `includeAll` response, so they are always
   * populated here. `brandLogoUrl` is joined later in the catalog layer
   * (`getArticles` carries no logo) and `fitsVehicle` is resolved per request,
   * so both default to null.
   */
  private mapArticleSummary(article: TecDocArticleRecord): ArticleSummaryDto {
    return {
      articleNumber: article.articleNumber,
      brandName: article.mfrName,
      brandLogoUrl: null,
      description:
        article.genericArticles?.[0]?.genericArticleDescription ?? '',
      thumbnailUrl: article.images?.[0]?.imageURL800 ?? null,
      technicalSpecs: (article.articleCriteria ?? []).map((criterion) => ({
        key: criterion.criteriaDescription,
        value: criterion.formattedValue,
      })),
      oemNumbers: (article.oemNumbers ?? []).map((oem) => oem.articleNumber),
      fitsVehicle: null,
    };
  }

  /**
   * Turns the raw TecDoc facet count blocks into the shared facet groups. Brand
   * values carry a `dataSupplierId` id (so a selection maps back to the
   * `dataSupplierIds` filter) with the logo left null for the catalog layer to
   * join; category values carry a `genericArticleId` id. Empty groups are
   * dropped so the response only advertises facets the user can actually apply.
   */
  private mapSearchFacets(
    brandCounts: Array<{
      dataSupplierId: number;
      mfrName: string;
      count: number;
    }> = [],
    categoryCounts: Array<{
      genericArticleId: number;
      genericArticleDescription: string;
      count: number;
    }> = [],
  ): SearchFacetDto[] {
    const facets: SearchFacetDto[] = [];

    const brandValues: FacetValueDto[] = brandCounts.map((c) => ({
      id: String(c.dataSupplierId),
      label: c.mfrName,
      count: c.count,
      imageUrl: null,
    }));
    if (brandValues.length > 0) {
      facets.push({ id: 'brands', label: 'Производител', values: brandValues });
    }

    const categoryValues: FacetValueDto[] = categoryCounts.map((c) => ({
      id: String(c.genericArticleId),
      label: c.genericArticleDescription,
      count: c.count,
    }));
    if (categoryValues.length > 0) {
      facets.push({
        id: 'categories',
        label: 'Категория',
        values: categoryValues,
      });
    }

    return facets;
  }

  private async call<T>(
    functionName: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}/services/TecdocToCatDLB.jsonEndpoint`;
    const body = JSON.stringify({
      [functionName]: { provider: this.providerId, ...params },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      this.logger.error(
        `TecDoc API error ${response.status} for ${functionName}`,
      );
      throw new Error(`TecDoc API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}
