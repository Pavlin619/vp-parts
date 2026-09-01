import { Injectable } from '@nestjs/common';
import { ArticleSummaryDto } from '@vp-parts-shop/shared';
import {
  TecDocTransport,
  TecDocArticleRecord,
  mapArticleSummary,
} from '../../../tecdoc';

/**
 * The hydration read behind every article list: turns the `legacyArticleId`s of
 * the rows on one page into the rendered rows a grid shows.
 *
 * This is the expensive half of a list surface, so it is paid for one page of
 * rows at a time — 25 rows cost 217–251 KB against under a kilobyte each as
 * identities, which is why the whole match set is enumerated cheaply and only
 * the page a visitor reached is hydrated.
 *
 * The includes are exactly the three fields {@link mapArticleSummary} reads.
 * `includeArticleText` and `includeOEMNumbers` were requested here until
 * measurement showed the mapper reads neither: dropping them saved 32–60% with
 * the mapped rows byte-identical. `includeAll` is out for the same reason and
 * more — `pdfs`, `links`, `linkages`, `partsList`, `accessoryList`, `gtins` and
 * `prices` all ride along in it and none is rendered.
 */
@Injectable()
export class ArticleRowsTecDoc {
  constructor(private readonly transport: TecDocTransport) {}

  /**
   * TecDoc may answer with fewer rows than there were ids, so callers pair the
   * answer back onto what they asked for rather than assuming positions.
   */
  async getArticleRowsByLegacyIds(
    legacyArticleIds: number[],
  ): Promise<ArticleSummaryDto[]> {
    if (legacyArticleIds.length === 0) {
      return [];
    }

    const data = await this.transport.call<{
      articles?: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      legacyArticleIds,
      perPage: legacyArticleIds.length,
      page: 1,
      includeGenericArticles: true,
      includeArticleCriteria: true,
      includeImages: true,
    });

    return (data.articles ?? []).map((article) => mapArticleSummary(article));
  }
}
