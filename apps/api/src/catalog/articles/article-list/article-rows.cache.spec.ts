import { ArticleSummaryDto } from '@vp-parts-shop/shared';
import { RedisCache } from '../../../redis';
import { ArticleCandidate, ArticleStatus } from '../../../tecdoc';
import { ArticleRowsCache } from './article-rows.cache';
import { ArticleRowsTecDoc } from './article-rows.tecdoc';

const ARTICLE_ROW_TTL = 24 * 60 * 60;

function candidate(
  articleNumber: string,
  overrides: Partial<ArticleCandidate> = {},
): ArticleCandidate {
  return {
    brandId: '30',
    brandName: 'BOSCH',
    articleNumber,
    description: 'Спирачен диск',
    legacyArticleIds: [555],
    articleStatusId: ArticleStatus.Normal,
    ...overrides,
  };
}

function row(articleNumber: string): ArticleSummaryDto {
  return {
    articleNumber,
    brandId: '30',
    brandName: 'BOSCH',
    brandLogoUrl: null,
    description: 'Спирачен диск',
    thumbnailUrl: null,
    technicalSpecs: [],
    fitsVehicle: null,
  };
}

describe('ArticleRowsCache', () => {
  let getArticleRowsByLegacyIds: jest.Mock;
  let cachedMany: jest.Mock;
  let rows: ArticleRowsCache;

  /** Runs the request the way `cachedMany` does when nothing is cached. */
  function loadEverything() {
    cachedMany.mockImplementation(
      (request: {
        items: ArticleCandidate[];
        loadMissing: (missing: ArticleCandidate[]) => Promise<unknown>;
      }) => request.loadMissing(request.items),
    );
  }

  beforeEach(() => {
    getArticleRowsByLegacyIds = jest.fn().mockResolvedValue([]);
    cachedMany = jest.fn().mockResolvedValue([]);

    rows = new ArticleRowsCache(
      { getArticleRowsByLegacyIds } as unknown as ArticleRowsTecDoc,
      { cachedMany } as unknown as RedisCache,
    );
  });

  // The whole point of caching per row: two lists that surface the same part
  // must land on the same entry, so the key is the article identity and nothing
  // about the list that asked.
  it('keys each row by brand and number together', async () => {
    await rows.hydrate([candidate('A1'), candidate('A2', { brandId: '72' })]);

    const [request] = cachedMany.mock.calls[0];

    expect(request.items.map(request.keyOf)).toEqual([
      'tecdoc:article-row:30:A1',
      'tecdoc:article-row:72:A2',
    ]);
    expect(request.keyOfLoaded(row('A1'))).toBe('tecdoc:article-row:30:A1');
    expect(request.ttl).toBe(ARTICLE_ROW_TTL);
  });

  it('hydrates the misses by the legacy ids they carry', async () => {
    loadEverything();

    await rows.hydrate([
      candidate('A1', { legacyArticleIds: [777] }),
      candidate('A2', { legacyArticleIds: [778] }),
    ]);

    expect(getArticleRowsByLegacyIds).toHaveBeenCalledWith([777, 778]);
  });

  /**
   * TecDoc files one `legacyArticleId` per article/generic-article pair, so a
   * part catalogued in two roles carries two ids that resolve to the same
   * article — the second would buy a duplicate row.
   */
  it('sends one id per candidate even when it carries several', async () => {
    loadEverything();

    await rows.hydrate([candidate('A1', { legacyArticleIds: [777, 778] })]);

    expect(getArticleRowsByLegacyIds).toHaveBeenCalledWith([777]);
  });

  it('skips a candidate TecDoc filed no legacy id for', async () => {
    loadEverything();

    await rows.hydrate([
      candidate('A1', { legacyArticleIds: [] }),
      candidate('A2', { legacyArticleIds: [778] }),
    ]);

    expect(getArticleRowsByLegacyIds).toHaveBeenCalledWith([778]);
  });

  it('returns the rows the cache answered with', async () => {
    cachedMany.mockResolvedValueOnce([row('A1')]);

    expect(await rows.hydrate([candidate('A1')])).toEqual([row('A1')]);
  });
});
