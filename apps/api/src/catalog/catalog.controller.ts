import {
  Controller,
  Get,
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
  PaginatedArticlesDto,
  ArticleDetailDto,
  ArticleDetailSection,
} from '@vp-parts-shop/shared';

const VALID_SECTIONS: readonly ArticleDetailSection[] = [
  'details',
  'availability',
];

/**
 * Parses the `include` query (e.g. `details`, `availability`, or
 * `details,availability`) into the sections to fetch. Unknown tokens are
 * dropped; an absent or fully-invalid value falls back to the full response so
 * the endpoint stays backwards-compatible.
 */
export function parseIncludeSections(include?: string): ArticleDetailSection[] {
  if (!include) {
    return [...VALID_SECTIONS];
  }

  const requested = include
    .split(',')
    .map((token) => token.trim())
    .filter((token): token is ArticleDetailSection =>
      VALID_SECTIONS.includes(token as ArticleDetailSection),
    );

  return requested.length > 0 ? requested : [...VALID_SECTIONS];
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
  ): Promise<PaginatedArticlesDto> {
    const clampedPageSize = Math.min(Math.max(pageSize, 1), 50);
    return this.catalog.listArticles(
      vehicleId,
      categoryId,
      page,
      clampedPageSize,
    );
  }

  @Get('articles/:articleNumber')
  getArticleDetail(
    @Param('articleNumber') articleNumber: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('include') include?: string,
  ): Promise<Partial<ArticleDetailDto>> {
    return this.catalog.getArticleDetail(
      articleNumber,
      vehicleId,
      parseIncludeSections(include),
    );
  }
}
