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
} from '@vp-parts-shop/shared';

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
  ): Promise<ArticleDetailDto> {
    return this.catalog.getArticleDetail(articleNumber, vehicleId);
  }
}
