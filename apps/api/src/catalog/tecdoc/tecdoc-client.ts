import { Injectable, Logger } from '@nestjs/common';
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
  AttributeFacetDto,
  AttributeFacetValueDto,
  AttributeFacetRole,
  CategoryNavigationDto,
  CategoryOptionDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  AutocompleteItemDto,
} from '@vp-parts-shop/shared';

export type SearchMatchType =
  | 'exact'
  | 'prefix'
  | 'suffix'
  | 'prefix_or_suffix';

/**
 * A single technical-attribute (criteria) narrowing: the TecDoc `criteriaId`
 * plus the machine `rawValue` echoed back from an {@link AttributeFacetValueDto}.
 */
export interface CriteriaFilter {
  criteriaId: string;
  rawValue: string;
}

/**
 * Optional narrowing a caller applies to a search, selected from the facet
 * values returned on a previous search:
 * - `brandIds` — TecDoc dataSupplierIds (brand facet value ids); multi-select.
 * - `categoryNodeId` — a single TecDoc assemblyGroupNodeId. Category navigation
 *   is a single-path drill-down (one node at a time, deeper until a leaf), so it
 *   is a scalar, not an array — unlike the multi-select brand/criteria filters.
 * - `criteria` — technical-attribute selections (criteriaId + rawValue).
 * Groups are AND-combined; ids within a multi-select group are OR-combined.
 */
export interface SearchFilters {
  brandIds?: string[];
  categoryNodeId?: string;
  criteria?: CriteriaFilter[];
}

/**
 * Maps a TecDoc criteriaId (or, in dev, the mock's attribute label) to a
 * semantic {@link AttributeFacetRole} the client can render with a bespoke
 * control (e.g. a front/rear car diagram) instead of a plain value list.
 *
 * [VERIFY-TC] The numeric TecDoc criteriaId(s) below are best-effort candidates
 * and MUST be confirmed against the Pegasus 3.0 Test Client — a wrong id would
 * mislabel an unrelated criterion. The Bulgarian label entry only exists so the
 * mock client surfaces the role in dev; live data is matched by criteriaId.
 */
export const FITTING_POSITION_CRITERIA_ID = '2';

export const ATTRIBUTE_ROLE_BY_ID: Readonly<
  Record<string, AttributeFacetRole>
> = {
  [FITTING_POSITION_CRITERIA_ID]: 'fitting-position',
  'Позиция на монтаж': 'fitting-position',
};

export function attributeRoleFor(id: string): AttributeFacetRole | null {
  return ATTRIBUTE_ROLE_BY_ID[id] ?? null;
}

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
    criteriaId?: number;
    criteriaDescription: string;
    formattedValue: string;
    criteriaUnitDescription?: string;
    criteriaType?: string;
  }>;
  oemNumbers?: Array<{ articleNumber: string }>;
}

/**
 * One technical-attribute (criteria) facet block from a `getArticles`
 * `includeCriteriaFacets` response: the criterion metadata plus the value
 * counts over the match set. [VERIFY-TC] exact field names.
 */
interface TecDocCriteriaFacetCount {
  criteriaId: number;
  criteriaDescription: string;
  criteriaUnitDescription?: string | null;
  criteriaType?: string | null;
  isInterval?: boolean;
  criteriaValues: Array<{
    rawValue: string;
    formattedValue: string;
    count: number;
  }>;
}

/**
 * One node of a `getArticles` `assemblyGroupFacets` tree: the same shape
 * `getAssemblyGroupTree` consumes, extended with the (optional) article `count`
 * and the number of child nodes TecDoc reports for a vehicle-linkage search.
 * `childCount` is our name for that count — [VERIFY-TC] confirm the raw field
 * name/shape against the Test Client (it is a count, distinct from the child
 * `options` the navigation builder derives).
 */
interface TecDocAssemblyGroupFacetCount {
  assemblyGroupNodeId: number;
  assemblyGroupName: string;
  parentNodeId?: number | null;
  childCount?: number;
  count?: number;
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
   * Free-text/number search (searchType 10 — "any number"). Always asks TecDoc
   * for the brand (`dataSupplier`) facet and the hierarchical category
   * (`assemblyGroup`) tree over the whole match set, and forwards any active
   * selections as `dataSupplierIds` / `assemblyGroupNodeIds` / `criteriaFilters`.
   *
   * Technical-attribute (`criteria`) facets are **gated on landing at a leaf
   * category**: `includeCriteriaFacets` is requested only when a category is
   * selected (never on a broad search), and the returned criteria are surfaced
   * only when the selected node is a leaf (`current.hasChildren === false`). A
   * broad, multi-category search therefore neither requests nor carries any
   * attributes — they would be an incoherent cross-category mix — and they appear
   * once the user has drilled to the deepest node. TecDoc scopes the criteria to
   * whatever filters are sent, so `assemblyGroupNodeIds` alone scopes them to the
   * landed category.
   *
   * Results keep TecDoc's native article order — no client-side ranking.
   *
   * [VERIFY-TC] The exact field names of `criteriaFacets`, the population of
   * `assemblyGroupFacets` counts without a vehicle linkage, and that the selected
   * leaf node is still present in the filtered tree are confirmed against the
   * Pegasus 3.0 Test Client (see checklist in the Phase 3.5 plan).
   */
  async searchArticles(
    query: string,
    vehicleId?: string,
    matchType: SearchMatchType = 'prefix_or_suffix',
    page = 1,
    pageSize = 50,
    filters?: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    const categorySelected = Boolean(filters?.categoryNodeId);

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
      criteriaFacets?: {
        counts: Array<TecDocCriteriaFacetCount>;
      };
      assemblyGroupFacets?: {
        counts: Array<TecDocAssemblyGroupFacetCount>;
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
      // Only worth the payload once the search is scoped to a category; a broad
      // search's criteria would span unrelated product types.
      // TODO(search-ux): auto-surface dimensions when a precise query (e.g. a
      // full part number) collapses to a single leaf category, so the user need
      // not click to reveal them. Preferred approach: keep this broad call cheap
      // and, when categoryNavigation resolves to exactly one leaf option, fire
      // one follow-up scoped getArticles for its criteria (Redis-cached). See
      // the Phase 3.5 plan; revisit alongside Test Client verification.
      ...(categorySelected && { includeCriteriaFacets: true }),
      // Match-scoped category facet: only the assembly groups present in the
      // result set, with article counts — NOT the whole catalogue tree
      // (that is getAssemblyGroupTree's job). `assemblyGroupType: 'P'` scopes to
      // passenger cars, matching getAssemblyGroupTree.
      // [VERIFY-TC] confirm the subset+counts shape with includeCompleteTree
      // false, and that a selected node stays present in the filtered facet.
      assemblyGroupFacetOptions: {
        enabled: true,
        assemblyGroupType: 'P',
        includeCompleteTree: false,
      },
      ...(vehicleId != null && {
        linkageTargetType: 'P',
        linkageTargetId: Number(vehicleId),
      }),
      ...(filters?.brandIds?.length && {
        dataSupplierIds: filters.brandIds.map(Number),
      }),
      ...(filters?.categoryNodeId && {
        assemblyGroupNodeIds: [Number(filters.categoryNodeId)],
      }),
      ...(filters?.criteria?.length && {
        criteriaFilters: filters.criteria.map((c) => ({
          criteriaId: Number(c.criteriaId),
          rawValue: c.rawValue,
        })),
      }),
    });

    const categoryNavigation = this.buildCategoryNavigation(
      data.assemblyGroupFacets?.counts,
      filters?.categoryNodeId,
    );

    // A selected leaf category has coherent criteria, so surface the attribute
    // facets. Prefer the current node's own `hasChildren` (which also honours
    // TecDoc's childCount, so a node whose children were not returned is still
    // treated as a non-leaf); fall back to "no options" only when TecDoc omitted
    // the selected node from the scoped facet entirely.
    const atLeaf =
      categorySelected &&
      (categoryNavigation.current
        ? categoryNavigation.current.hasChildren === false
        : categoryNavigation.options.length === 0);

    return {
      total: data.totalMatchingArticles,
      page,
      pageSize,
      items: (data.articles ?? []).map((article) =>
        this.mapArticleSummary(article),
      ),
      facets: this.mapBrandFacets(data.dataSupplierFacets?.counts),
      attributes: atLeaf
        ? this.mapAttributeFacets(data.criteriaFacets?.counts)
        : [],
      categoryNavigation,
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
   * Turns the raw TecDoc brand facet counts into the shared brand facet group.
   * Values carry a `dataSupplierId` id (so a selection maps back to the
   * `dataSupplierIds` filter) with the logo left null for the catalog layer to
   * join. An empty group is dropped so the response only advertises a facet the
   * user can actually apply.
   */
  private mapBrandFacets(
    brandCounts: Array<{
      dataSupplierId: number;
      mfrName: string;
      count: number;
    }> = [],
  ): SearchFacetDto[] {
    const brandValues: FacetValueDto[] = brandCounts.map((c) => ({
      id: String(c.dataSupplierId),
      label: c.mfrName,
      count: c.count,
      imageUrl: null,
    }));

    return brandValues.length > 0
      ? [{ id: 'brands', label: 'Производител', values: brandValues }]
      : [];
  }

  /**
   * Turns the raw TecDoc `criteriaFacets` blocks into the shared attribute facet
   * groups. Each criterion becomes one group keyed by its `criteriaId`, carrying
   * the unit and type so the UI can render numeric attributes (with intervals)
   * differently from enum ones. Groups with no values are dropped.
   */
  private mapAttributeFacets(
    criteriaCounts: TecDocCriteriaFacetCount[] = [],
  ): AttributeFacetDto[] {
    return criteriaCounts
      .map((criterion): AttributeFacetDto => {
        const values: AttributeFacetValueDto[] = (
          criterion.criteriaValues ?? []
        ).map((v) => ({
          value: v.rawValue,
          label: v.formattedValue,
          count: v.count,
        }));

        const id = String(criterion.criteriaId);

        return {
          id,
          label: criterion.criteriaDescription,
          unit: criterion.criteriaUnitDescription ?? null,
          type: criterion.criteriaType ?? 'A',
          isInterval: criterion.isInterval ?? false,
          role: attributeRoleFor(id),
          values,
        };
      })
      .filter((facet) => facet.values.length > 0);
  }

  /**
   * Turns the flat TecDoc `assemblyGroupFacets` counts into **single-level**
   * navigation: the immediate `options` for the current position (roots when
   * nothing is selected, otherwise the selected node's children) plus the
   * `current` node. The UI drills one level at a time and re-issues the search
   * per click, so the whole subtree is never shipped and there is no breadcrumb
   * (each level is its own search URL). `current` is best-effort — resolvable
   * only when TecDoc returns the selected node in the scoped facet ([VERIFY-TC]).
   */
  private buildCategoryNavigation(
    counts: TecDocAssemblyGroupFacetCount[] = [],
    selectedNodeId?: string,
  ): CategoryNavigationDto {
    const ROOT_KEY = '__root__';
    const nodeById = new Map<string, TecDocAssemblyGroupFacetCount>();
    const childrenByParent = new Map<string, TecDocAssemblyGroupFacetCount[]>();

    for (const raw of counts) {
      nodeById.set(String(raw.assemblyGroupNodeId), raw);
    }

    for (const raw of counts) {
      const parentId =
        raw.parentNodeId != null ? String(raw.parentNodeId) : null;
      const key =
        parentId != null && nodeById.has(parentId) ? parentId : ROOT_KEY;
      const siblings = childrenByParent.get(key) ?? [];
      siblings.push(raw);
      childrenByParent.set(key, siblings);
    }

    const toOption = (
      raw: TecDocAssemblyGroupFacetCount,
    ): CategoryOptionDto => {
      const id = String(raw.assemblyGroupNodeId);
      const childList = childrenByParent.get(id) ?? [];
      return {
        id,
        label: raw.assemblyGroupName,
        count: raw.count ?? null,
        hasChildren: childList.length > 0 || (raw.childCount ?? 0) > 0,
      };
    };

    const optionSource = selectedNodeId
      ? (childrenByParent.get(selectedNodeId) ?? [])
      : (childrenByParent.get(ROOT_KEY) ?? []);
    const options = optionSource.map(toOption);

    const currentRaw = selectedNodeId
      ? nodeById.get(selectedNodeId)
      : undefined;
    const current = currentRaw ? toOption(currentRaw) : null;

    return { current, options };
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
