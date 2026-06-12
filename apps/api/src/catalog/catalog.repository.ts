import { Injectable } from '@nestjs/common';
import { TecDocCacheService } from './tecdoc/tecdoc-cache.service';
import { SearchMatchType } from './tecdoc/tecdoc-client';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedArticlesDto,
  ArticleDetailDto,
  ArticleListItemDto,
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
  ): Promise<PaginatedArticlesDto> {
    return this.tecdocCache.getArticles(vehicleId, categoryId, page, pageSize);
  }

  async findArticleDetails(
    articleNumber: string,
    vehicleId?: string,
  ): Promise<ArticleDetailDto> {
    return this.tecdocCache.getArticleDetails(articleNumber, vehicleId);
  }

  async searchArticles(
    query: string,
    vehicleId?: string,
    matchType?: SearchMatchType,
  ): Promise<ArticleListItemDto[]> {
    return this.tecdocCache.searchArticles(query, vehicleId, matchType);
  }

  async findAutocompleteSuggestions(
    query: string,
  ): Promise<AutocompleteItemDto[]> {
    return this.tecdocCache.getAutocompleteSuggestions(query);
  }
}
