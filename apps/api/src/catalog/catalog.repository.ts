import { Injectable } from '@nestjs/common';
import { TecDocCacheService } from './tecdoc/tecdoc-cache.service';
import { SearchMatchType } from './tecdoc/tecdoc-client';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedCatalogArticlesDto,
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
  ): Promise<ArticleSummaryDto[]> {
    const results = await this.tecdocCache.searchArticles(
      query,
      vehicleId,
      matchType,
    );

    return this.enrichWithBrandLogos(results);
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

    const brands = await this.tecdocCache.getBrands();
    const logoByBrand = new Map(
      brands.map((brand) => [brand.brandName, brand.logoUrl]),
    );

    return items.map((item) => ({
      ...item,
      brandLogoUrl: logoByBrand.get(item.brandName) ?? null,
    }));
  }
}
