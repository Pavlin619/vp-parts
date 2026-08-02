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
  AlternativeNumberDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
  LinkedVehicleDto,
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

  @Get('articles/:articleNumber/substitutes')
  getSubstitutes(
    @Param('articleNumber') articleNumber: string,
  ): Promise<ArticleSummaryDto[]> {
    return this.articles.getSubstitutes(articleNumber);
  }

  /**
   * The numbers other brands sell this part under. Its own route because no
   * list surface carries them — only the OE numbers ride along on the catalog
   * response — so the alternative-numbers section fetches them when a visitor
   * opens it.
   *
   * Not nested under a brand, like the substitutes route it shares a source
   * with: the comparable-number search is keyed on the number alone.
   */
  @Get('articles/:articleNumber/alternative-numbers')
  getAlternativeNumbers(
    @Param('articleNumber') articleNumber: string,
  ): Promise<AlternativeNumberDto[]> {
    return this.articles.getAlternativeNumbers(articleNumber);
  }

  /**
   * The vehicles this article fits. Its own route because no list surface shows
   * it — the applicable-vehicles section fetches it when a visitor opens it, so
   * a part with thousands of linkages costs nothing until then. Brand-scoped
   * for the same reason as the detail route above; the linkages are per part,
   * so the wrong brand answers with another part's vehicles.
   */
  @Get('brands/:brandId/articles/:articleNumber/linked-vehicles')
  getLinkedVehicles(
    @Param('brandId', ParseTecDocIdPipe) brandId: number,
    @Param('articleNumber') articleNumber: string,
  ): Promise<LinkedVehicleDto[]> {
    return this.articles.getLinkedVehicles(brandId, articleNumber);
  }
}
