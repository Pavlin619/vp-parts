import { Injectable } from '@nestjs/common';
import { TecDocCacheService } from './tecdoc/tecdoc-cache.service';
import { SearchMatchType, SearchFilters } from './tecdoc/tecdoc-client';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  BrandDto,
  PaginatedCatalogArticlesDto,
  PaginatedSearchArticlesDto,
  SearchFacetDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  AutocompleteItemDto,
} from '@vp-parts-shop/shared';

/**
 * Repository for catalog data. At launch, TecDoc data is Redis-cached only.
 * Postgres cache is stubbed for future implementation.
 */
@Injectable()
export class CatalogRepository {
  constructor(private readonly tecdocCache: TecDocCacheService) {}

  async findManufacturers(): Promise<ManufacturerDto[]> {
    return this.tecdocCache.getManufacturers();
  }

  async findModelSeries(manufacturerId: string): Promise<ModelSeriesDto[]> {
    return this.tecdocCache.getModelSeries(manufacturerId);
  }

  async findVehicleVariants(seriesId: string): Promise<VehicleVariantDto[]> {
    return this.tecdocCache.getVehicleTypes(seriesId);
  }

  async findAssemblyGroupTree(vehicleId: string): Promise<AssemblyGroupDto[]> {
    return this.tecdocCache.getAssemblyGroupTree(vehicleId);
  }

  async findArticles(
    vehicleId: string,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    const articles = await this.tecdocCache.getArticles(
      vehicleId,
      categoryId,
      page,
      pageSize,
    );

    const items = await this.enrichWithBrandLogos(articles.items);

    return { ...articles, items };
  }

  async findArticleDetails(
    articleNumber: string,
    vehicleId?: string,
  ): Promise<ArticleCatalogDetailDto> {
    const detail = await this.tecdocCache.getArticleDetails(
      articleNumber,
      vehicleId,
    );

    const [enriched] = await this.enrichWithBrandLogos([detail]);

    return enriched;
  }

  async findSubstitutes(articleNumber: string): Promise<ArticleSummaryDto[]> {
    const substitutes = await this.tecdocCache.getSubstitutes(articleNumber);

    return this.enrichWithBrandLogos(substitutes);
  }

  async searchArticles(
    query: string,
    vehicleId?: string,
    matchType?: SearchMatchType,
    page = 1,
    pageSize = 50,
    filters?: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    const results = await this.tecdocCache.searchArticles(
      query,
      vehicleId,
      matchType,
      page,
      pageSize,
      filters,
    );

    if (results.items.length === 0 && results.facets.length === 0) {
      return results;
    }

    const logoByBrand = await this.brandLogoMap();
    const items = results.items.map((item) => ({
      ...item,
      brandLogoUrl: logoByBrand.get(item.brandName) ?? null,
    }));
    const facets = this.attachBrandFacetLogos(results.facets, logoByBrand);

    return { ...results, items, facets };
  }

  async findBrands(): Promise<BrandDto[]> {
    return this.tecdocCache.getBrands();
  }

  async findAutocompleteSuggestions(
    query: string,
  ): Promise<AutocompleteItemDto[]> {
    return this.tecdocCache.getAutocompleteSuggestions(query);
  }

  /**
   * TecDoc keys articles by brand name but returns logos only from getBrands,
   * so the two are joined here by brand name for every list and detail surface.
   * A row whose brand has no logo on file keeps `brandLogoUrl: null`. Skips the
   * (cached) getBrands read entirely for an empty batch so an empty search or
   * substitutes result never triggers it.
   */
  private async enrichWithBrandLogos<
    T extends { brandName: string; brandLogoUrl: string | null },
  >(items: T[]): Promise<T[]> {
    if (items.length === 0) {
      return items;
    }

    const logoByBrand = await this.brandLogoMap();

    return items.map((item) => ({
      ...item,
      brandLogoUrl: logoByBrand.get(item.brandName) ?? null,
    }));
  }

  /**
   * The brand-name → logo lookup used to enrich both article rows and the brand
   * search facet. Backed by the (cached) getBrands read.
   */
  private async brandLogoMap(): Promise<Map<string, string | null>> {
    const brands = await this.tecdocCache.getBrands();

    return new Map(brands.map((brand) => [brand.brandName, brand.logoUrl]));
  }

  /**
   * Fills each brand facet value's `imageUrl` from the same logo map used for
   * the rows, so the brand filter list renders logos. Category facets are
   * returned untouched (they carry no logo).
   */
  private attachBrandFacetLogos(
    facets: SearchFacetDto[],
    logoByBrand: Map<string, string | null>,
  ): SearchFacetDto[] {
    return facets.map((facet) =>
      facet.id === 'brands'
        ? {
            ...facet,
            values: facet.values.map((value) => ({
              ...value,
              imageUrl: logoByBrand.get(value.label) ?? null,
            })),
          }
        : facet,
    );
  }
}
