import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CatalogService } from './catalog.service';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared';

/**
 * Parses the comma-separated `numbers` query for the bulk availability endpoint
 * into a de-duplicated list of article numbers. Blank tokens are dropped; an
 * absent or empty value yields an empty list (the service returns an empty map).
 */
export function parseArticleNumbers(numbers?: string): string[] {
  if (!numbers) {
    return [];
  }

  const seen = new Set<string>();
  for (const token of numbers.split(',')) {
    const trimmed = token.trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }

  return [...seen];
}

@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('manufacturers')
  getManufacturers(): Promise<ManufacturerDto[]> {
    return this.catalog.getManufacturers();
  }

  @Get('manufacturers/:manufacturerId/model-series')
  getModelSeries(
    @Param('manufacturerId') manufacturerId: string,
  ): Promise<ModelSeriesDto[]> {
    return this.catalog.getModelSeries(manufacturerId);
  }

  @Get('model-series/:seriesId/variants')
  getVehicleVariants(
    @Param('seriesId') seriesId: string,
  ): Promise<VehicleVariantDto[]> {
    return this.catalog.getVehicleVariants(seriesId);
  }

  @Get('vehicles/:vehicleId/categories')
  getCategoryTree(
    @Param('vehicleId') vehicleId: string,
  ): Promise<AssemblyGroupDto[]> {
    return this.catalog.getCategoryTree(vehicleId);
  }

  @Get('vehicles/:vehicleId/categories/:categoryId/articles')
  listArticles(
    @Param('vehicleId') vehicleId: string,
    @Param('categoryId') categoryId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    const clampedPageSize = Math.min(Math.max(pageSize, 1), 50);
    return this.catalog.listArticleMetadata(
      vehicleId,
      categoryId,
      page,
      clampedPageSize,
    );
  }

  /**
   * Live, never-cached price/availability for a batch of article numbers. The
   * cached catalog grid calls this to hydrate its metadata rows with fresh
   * delivery/stock data, so the response must not be cached (a stale delivery
   * date is worse than a slightly slower read).
   */
  @Get('articles-availability')
  @Header('Cache-Control', 'no-store')
  getArticlesAvailability(
    @Query('numbers') numbers?: string,
  ): Promise<ArticlesAvailabilityDto> {
    return this.catalog.getArticlesAvailability(parseArticleNumbers(numbers));
  }

  @Get('articles/:articleNumber')
  getArticleDetail(
    @Param('articleNumber') articleNumber: string,
    @Query('vehicleId') vehicleId?: string,
  ): Promise<ArticleCatalogDetailDto> {
    return this.catalog.getArticleDetail(articleNumber, vehicleId);
  }

  @Get('articles/:articleNumber/substitutes')
  getSubstitutes(
    @Param('articleNumber') articleNumber: string,
  ): Promise<ArticleSummaryDto[]> {
    return this.catalog.getSubstitutes(articleNumber);
  }
}
