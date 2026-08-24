import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared';
import { Public } from '../../auth/public.decorator';
import { ParseTecDocIdPipe } from '../../tecdoc';
import {
  ArticlePageQueryDto,
  ArticlesAvailabilityQueryDto,
} from './articles.dto';
import { ArticlesService } from './articles.service';

@Public()
@Controller('catalog')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get('vehicles/:vehicleId/categories/:categoryId/articles')
  listArticles(
    @Param('vehicleId', ParseTecDocIdPipe) vehicleId: number,
    @Param('categoryId', ParseTecDocIdPipe) categoryId: number,
    @Query() paging: ArticlePageQueryDto,
  ): Promise<PaginatedCatalogArticlesDto> {
    return this.articles.listArticleMetadata(
      vehicleId,
      categoryId,
      paging.page,
      paging.pageSize,
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

  /**
   * Nested under the brand because an article number is not unique on its own:
   * two TecDoc data suppliers can file the same one, and resolving it without a
   * brand returns whichever the catalogue happened to sort first.
   */
  @Get('brands/:brandId/articles/:articleNumber')
  getArticleDetail(
    @Param('brandId', ParseTecDocIdPipe) brandId: number,
    @Param('articleNumber') articleNumber: string,
    @Query('vehicleId', ParseTecDocIdPipe) vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    return this.articles.getArticleDetail(brandId, articleNumber, vehicleId);
  }
}
