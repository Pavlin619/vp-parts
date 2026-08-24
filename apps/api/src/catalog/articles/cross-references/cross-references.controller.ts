import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  AlternativeNumberDto,
} from '@vp-parts-shop/shared';
import { Public } from '../../../auth/public.decorator';
import { ParseTecDocIdPipe } from '../../../tecdoc';
import { ArticlePageQueryDto } from '../articles.dto';
import { CrossReferencesService } from './cross-references.service';

/**
 * The two routes that disclose which parts replace a part. Both are brand-scoped
 * for the same reason the article detail route is: which parts replace a part is
 * a property of that part, and which part a number means depends on who filed it,
 * so the wrong brand answers with another part's replacements.
 */
@Public()
@Controller('catalog/brands/:brandId/articles/:articleNumber')
export class CrossReferencesController {
  constructor(private readonly crossReferences: CrossReferencesService) {}

  /**
   * Paginated because the section shows every alternative rather than a truncated
   * few: `total` counts the whole cross-reference set, while a page carries only
   * the rows a visitor has reached. The ordering is decided per request from live
   * stock, so the pager is over a set, not over cached pages.
   */
  @Get('substitutes')
  getSubstitutes(
    @Param('brandId', ParseTecDocIdPipe) brandId: number,
    @Param('articleNumber') articleNumber: string,
    @Query() paging: ArticlePageQueryDto,
  ): Promise<PaginatedCatalogArticlesDto> {
    return this.crossReferences.getSubstitutes(
      brandId,
      articleNumber,
      paging.page,
      paging.pageSize,
    );
  }

  /**
   * The numbers other brands sell this part under. Its own route because no list
   * surface carries them — only the OE numbers ride along on the catalog
   * response — so the alternative-numbers section fetches them when a visitor
   * opens it.
   *
   * Uncapped: it is answered from the same cross-reference set the substitutes
   * page is, and a chip needs only the number and brand the candidate already
   * carries, so there is nothing per row to pay for.
   */
  @Get('alternative-numbers')
  getAlternativeNumbers(
    @Param('brandId', ParseTecDocIdPipe) brandId: number,
    @Param('articleNumber') articleNumber: string,
  ): Promise<AlternativeNumberDto[]> {
    return this.crossReferences.getAlternativeNumbers(brandId, articleNumber);
  }
}
