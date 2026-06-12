import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { Redis } from 'ioredis';
import { TecDocClient, SearchMatchType } from './tecdoc-client';

export const REDIS_CLIENT = 'REDIS_CLIENT';

const VEHICLE_TREE_TTL = 7 * 24 * 60 * 60;
const ARTICLE_TTL = 24 * 60 * 60;
const SEARCH_TTL = 60 * 60;
const SEARCH_MISS_TTL = 10 * 60;
const AUTOCOMPLETE_TTL = 30 * 60;

@Injectable()
export class TecDocCacheService {
  private readonly logger = new Logger(TecDocCacheService.name);

  constructor(
    private readonly tecdocClient: TecDocClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getManufacturers(): Promise<ManufacturerDto[]> {
    return this.cached('tecdoc:manufacturers:all', VEHICLE_TREE_TTL, () =>
      this.tecdocClient.getManufacturers(),
    );
  }

  async getModelSeries(manufacturerId: string): Promise<ModelSeriesDto[]> {
    return this.cached(
      `tecdoc:model-series:${manufacturerId}`,
      VEHICLE_TREE_TTL,
      () => this.tecdocClient.getModelSeries(manufacturerId),
    );
  }

  async getVehicleTypes(seriesId: string): Promise<VehicleVariantDto[]> {
    return this.cached(
      `tecdoc:vehicle-types:${seriesId}`,
      VEHICLE_TREE_TTL,
      () => this.tecdocClient.getVehicleTypes(seriesId),
    );
  }

  async getAssemblyGroupTree(vehicleId: string): Promise<AssemblyGroupDto[]> {
    return this.cached(
      `tecdoc:assembly-groups:${vehicleId}`,
      VEHICLE_TREE_TTL,
      () => this.tecdocClient.getAssemblyGroupTree(vehicleId),
    );
  }

  async getArticles(
    vehicleId: string,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedArticlesDto> {
    return this.cached(
      `tecdoc:articles:${vehicleId}:${categoryId}:${page}:${pageSize}`,
      ARTICLE_TTL,
      () =>
        this.tecdocClient.getArticles(vehicleId, categoryId, page, pageSize),
    );
  }

  async getArticleDetails(
    articleNumber: string,
    vehicleId?: string,
  ): Promise<ArticleDetailDto> {
    const vehicleKey = vehicleId ?? 'none';
    return this.cached(
      `tecdoc:article-detail:${articleNumber}:${vehicleKey}`,
      ARTICLE_TTL,
      () => this.tecdocClient.getArticleDetails(articleNumber, vehicleId),
    );
  }

  async searchArticles(
    query: string,
    vehicleId?: string,
    matchType: SearchMatchType = 'prefix_or_suffix',
  ): Promise<ArticleListItemDto[]> {
    const vehicleKey = vehicleId ?? 'none';
    return this.cachedArray(
      `tecdoc:search:${query}:${vehicleKey}:${matchType}`,
      SEARCH_TTL,
      SEARCH_MISS_TTL,
      () => this.tecdocClient.searchArticles(query, vehicleId, matchType),
    );
  }

  async getAutocompleteSuggestions(
    query: string,
  ): Promise<AutocompleteItemDto[]> {
    return this.cached(`tecdoc:autocomplete:${query}`, AUTOCOMPLETE_TTL, () =>
      this.tecdocClient.getAutocompleteSuggestions(query),
    );
  }

  private async cached<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached !== null) {
      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as T;
    }

    this.logger.debug(`Cache miss: ${key}`);
    const value = await loader();
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    return value;
  }

  private async cachedArray<T>(
    key: string,
    hitTtl: number,
    missTtl: number,
    loader: () => Promise<T[]>,
  ): Promise<T[]> {
    const cached = await this.redis.get(key);
    if (cached !== null) {
      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as T[];
    }

    this.logger.debug(`Cache miss: ${key}`);
    const value = await loader();
    const ttl = value.length > 0 ? hitTtl : missTtl;
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    return value;
  }
}
