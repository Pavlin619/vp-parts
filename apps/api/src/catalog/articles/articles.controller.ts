import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared';
import { Public } from '../../auth/public.decorator';
import { ParseTecDocIdPipe } from '../../tecdoc';
import { ArticlesAvailabilityQueryDto } from './articles.dto';
import { ArticlesService } from './articles.service';

@Public()
@Controller('catalog')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get('vehicles/:vehicleId/categories/:categoryId/articles')
  listArticles(
    @Param('vehicleId', ParseTecDocIdPipe) vehicleId: number,
    @Param('categoryId', ParseTecDocIdPipe) categoryId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    const clampedPageSize = Math.min(Math.max(pageSize, 1), 50);
    return this.articles.listArticleMetadata(
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
    @Query() dto: ArticlesAvailabilityQueryDto,
  ): Promise<ArticlesAvailabilityDto> {
    return this.articles.getArticlesAvailability(dto.numbers);
  }

  @Get('articles/:articleNumber')
  getArticleDetail(
    @Param('articleNumber') articleNumber: string,
    @Query('vehicleId', ParseTecDocIdPipe) vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    return this.articles.getArticleDetail(articleNumber, vehicleId);
  }

  @Get('articles/:articleNumber/substitutes')
  getSubstitutes(
    @Param('articleNumber') articleNumber: string,
  ): Promise<ArticleSummaryDto[]> {
    return this.articles.getSubstitutes(articleNumber);
  }
}
