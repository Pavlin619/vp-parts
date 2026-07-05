import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedArticlesDto,
  ArticleCatalogDetailDto,
  ArticleCatalogListItemDto,
  ArticleDetailDto,
  ArticleDetailSection,
  ArticleInventoryDetailDto,
  ArticleListItemDto,
  AutocompleteItemDto,
} from '@vp-parts-shop/shared';
import { CatalogRepository } from './catalog.repository';
import { SearchMatchType } from './tecdoc/tecdoc-client';
import { InventoryService } from '../inventory';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly repository: CatalogRepository,
    private readonly inventory: InventoryService,
  ) {}

  async getManufacturers(): Promise<ManufacturerDto[]> {
    return this.repository.findManufacturers();
  }

  async getModelSeries(manufacturerId: string): Promise<ModelSeriesDto[]> {
    return this.repository.findModelSeries(manufacturerId);
  }

  async getVehicleVariants(seriesId: string): Promise<VehicleVariantDto[]> {
    return this.repository.findVehicleVariants(seriesId);
  }

  async getCategoryTree(vehicleId: string): Promise<AssemblyGroupDto[]> {
    return this.repository.findAssemblyGroupTree(vehicleId);
  }

  async listArticles(
    vehicleId: string,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedArticlesDto> {
    const paginated = await this.repository.findArticles(
      vehicleId,
      categoryId,
      page,
      pageSize,
    );

    const enriched = await this.enrichWithInventory(paginated.items);

    return { ...paginated, items: enriched };
  }

  async searchArticles(
    query: string,
    vehicleId?: string,
    matchType?: SearchMatchType,
  ): Promise<ArticleListItemDto[]> {
    const results = await this.repository.searchArticles(
      query,
      vehicleId,
      matchType,
    );
    return this.enrichWithInventory(results);
  }

  async getAutocompleteSuggestions(
    query: string,
  ): Promise<AutocompleteItemDto[]> {
    return this.repository.findAutocompleteSuggestions(query);
  }

  /**
   * Assembles the article detail response from two independent halves — cached
   * TecDoc catalog metadata and live inventory — selected via `sections`. The
   * two reads run in parallel, and a section that is not requested is not read
   * at all: an availability-only call (the buy box) skips the TecDoc lookup
   * entirely, and a details-only call (the cached page shell) skips the DB.
   */
  async getArticleDetail(
    articleNumber: string,
    vehicleId?: string,
    sections: ArticleDetailSection[] = ['details', 'availability'],
  ): Promise<Partial<ArticleDetailDto>> {
    const [catalog, inventory] = await Promise.all([
      sections.includes('details')
        ? this.loadCatalogDetail(articleNumber, vehicleId)
        : undefined,
      sections.includes('availability')
        ? this.loadInventoryDetail(articleNumber)
        : undefined,
    ]);

    return { ...catalog, ...inventory };
  }

  private async loadCatalogDetail(
    articleNumber: string,
    vehicleId?: string,
  ): Promise<ArticleCatalogDetailDto> {
    try {
      return await this.repository.findArticleDetails(articleNumber, vehicleId);
    } catch {
      this.logger.warn(`Article not found: ${articleNumber}`);
      throw new NotFoundException(`Article not found: ${articleNumber}`);
    }
  }

  private async loadInventoryDetail(
    articleNumber: string,
  ): Promise<ArticleInventoryDetailDto> {
    const inv = await this.inventory.getBestPriceAndAvailability(articleNumber);

    return {
      available: inv.available,
      stockStatus: inv.stockStatus,
      estimatedDeliveryDays: inv.estimatedDeliveryDays,
      bestPriceExVat: inv.priceExVat,
      bestPriceIncVat: inv.priceIncVat,
      availabilityByWarehouse: inv.availabilityByWarehouse,
      computedAt: inv.computedAt,
    };
  }

  private async enrichWithInventory(
    items: ArticleCatalogListItemDto[],
  ): Promise<ArticleListItemDto[]> {
    if (items.length === 0) return [];

    const priceMap = await this.inventory.getBulkPricesAndAvailability(
      items.map((item) => item.articleNumber),
    );

    return items.map((item) => {
      const inv = priceMap.get(item.articleNumber);
      return {
        ...item,
        available: inv?.available ?? false,
        bestPriceExVat: inv?.priceExVat ?? null,
        bestPriceIncVat: inv?.priceIncVat ?? null,
      };
    });
  }
}
