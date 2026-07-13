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
import { ArticlesService } from './articles.service';

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
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get('vehicles/:vehicleId/categories/:categoryId/articles')
  listArticles(
    @Param('vehicleId') vehicleId: string,
    @Param('categoryId') categoryId: string,
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
    @Query('numbers') numbers?: string,
  ): Promise<ArticlesAvailabilityDto> {
    return this.articles.getArticlesAvailability(parseArticleNumbers(numbers));
  }

  @Get('articles/:articleNumber')
  getArticleDetail(
    @Param('articleNumber') articleNumber: string,
    @Query('vehicleId') vehicleId?: string,
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
