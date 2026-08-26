import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticlePartNumbersDto,
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
   * Every number this part can be ordered by: the vehicle manufacturers' own OE
   * numbers and the numbers other parts brands sell the equivalent under. Its
   * own route because no list surface carries either — OE numbers are the
   * bulkiest thing on an article and the alternatives are only known once the
   * cross-references resolve — so the section fetches both when it is opened.
   *
   * Uncapped: the alternatives come from the same cross-reference set the
   * substitutes page is answered from, and a chip needs only the number and
   * brand the candidate already carries, so there is nothing per row to pay for.
   */
  @Get('part-numbers')
  getPartNumbers(
    @Param('brandId', ParseTecDocIdPipe) brandId: number,
    @Param('articleNumber') articleNumber: string,
  ): Promise<ArticlePartNumbersDto> {
    return this.crossReferences.getPartNumbers(brandId, articleNumber);
  }
}
