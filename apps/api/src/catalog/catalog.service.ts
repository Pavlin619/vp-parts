import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedArticlesDto,
  ArticleDetailDto,
} from '@vp-parts-shop/shared';
import { CatalogRepository } from './catalog.repository';
import { InventoryService } from '../inventory/inventory.service';

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

    const enriched = await Promise.all(
      paginated.items.map(async (item) => {
        const inv = await this.inventory.getBestPriceAndAvailability(
          item.articleNumber,
        );
        return {
          ...item,
          available: inv.available,
          bestPriceExVat: inv.priceExVat,
          bestPriceIncVat: inv.priceIncVat,
        };
      }),
    );

    return { ...paginated, items: enriched };
  }

  async getArticleDetail(
    articleNumber: string,
    vehicleId?: string,
    customerRole?: string,
  ): Promise<ArticleDetailDto> {
    let detail: ArticleDetailDto;
    try {
      detail = await this.repository.findArticleDetails(
        articleNumber,
        vehicleId,
      );
    } catch {
      this.logger.warn(`Article not found: ${articleNumber}`);
      throw new NotFoundException(`Article not found: ${articleNumber}`);
    }

    const inv = await this.inventory.getBestPriceAndAvailability(
      articleNumber,
      customerRole,
    );

    return {
      ...detail,
      available: inv.available,
      stockStatus: inv.stockStatus,
      estimatedDeliveryDays: inv.estimatedDeliveryDays,
      bestPriceExVat: inv.priceExVat,
      bestPriceIncVat: inv.priceIncVat,
      ...(inv.tradePriceExVat != null && {
        tradePriceExVat: inv.tradePriceExVat,
        tradePriceIncVat: inv.tradePriceIncVat,
      }),
    };
  }
}
