import { Logger } from '@nestjs/common';
import { TecDocArticleRecord } from '../../tecdoc';
import { articleLookupPayload, requireArticle } from './article-lookup';
import { ArticleNotFoundException } from './article-not-found.exception';

const BOSCH = 30;

function record(articleNumber: string): TecDocArticleRecord {
  return { articleNumber, dataSupplierId: BOSCH, mfrName: 'Bosch' };
}

describe('articleLookupPayload', () => {
  // The bug this exists to prevent: an article number is unique only within a
  // data supplier, so a lookup without one resolves to whichever supplier
  // TecDoc sorted first and answers with another company's part.
  it('narrows the search to the brand that filed the number', () => {
    expect(articleLookupPayload(BOSCH, 'OX 982D')).toMatchObject({
      searchQuery: 'OX 982D',
      searchType: 0,
      dataSupplierIds: [BOSCH],
    });
  });

  // The documented default, sent explicitly: a lookup that quietly became a
  // prefix match would resolve to a different part altogether.
  it('states the exact match type rather than relying on the default', () => {
    expect(articleLookupPayload(BOSCH, 'OX 982D').searchMatchType).toBe(
      'exact',
    );
  });

  // Brand + exact number is meant to match one part, and these records are
  // heavy — a wider page would be paid for on every read to discard the surplus.
  it('asks for a single row', () => {
    expect(articleLookupPayload(BOSCH, 'OX 982D')).toMatchObject({
      perPage: 1,
      page: 1,
    });
  });
});

describe('requireArticle', () => {
  let warn: jest.Mock;
  let logger: Logger;

  beforeEach(() => {
    warn = jest.fn();
    logger = { warn } as unknown as Logger;
  });

  it('returns the row the lookup found', () => {
    const article = record('OX 982D');

    expect(requireArticle({ articles: [article] }, 'OX 982D', logger)).toBe(
      article,
    );
  });

  // TecDoc answers a lookup that matched nothing with an absent collection
  // rather than an error, so without this an unknown number reads as an article
  // with undefined everything.
  it('reports an omitted collection as a typed miss', () => {
    expect(() => requireArticle({}, 'missing', logger)).toThrow(
      ArticleNotFoundException,
    );
  });

  it('reports an empty collection as a typed miss', () => {
    expect(() => requireArticle({ articles: [] }, 'missing', logger)).toThrow(
      ArticleNotFoundException,
    );
  });

  // The brand filter cannot split two records of one supplier and nothing here
  // can tell which is meant, so the count is read purely to raise the case; the
  // answer stays whichever row TecDoc put first.
  it('warns on an ambiguous match but still answers', () => {
    const first = record('OX 982D');

    const result = requireArticle(
      { totalMatchingArticles: 2, articles: [first, record('OX 982D')] },
      'OX 982D',
      logger,
    );

    expect(result).toBe(first);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Ambiguous lookup for article OX 982D'),
    );
  });

  it('stays quiet on the single match it expects', () => {
    requireArticle(
      { totalMatchingArticles: 1, articles: [record('OX 982D')] },
      'OX 982D',
      logger,
    );

    expect(warn).not.toHaveBeenCalled();
  });

  // Not every lookup response carries the count; a missing one is read as the
  // single match it almost always is rather than as an ambiguity.
  it('treats a missing count as unambiguous', () => {
    requireArticle({ articles: [record('OX 982D')] }, 'OX 982D', logger);

    expect(warn).not.toHaveBeenCalled();
  });
});
