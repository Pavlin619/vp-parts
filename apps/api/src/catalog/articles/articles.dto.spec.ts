import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ARTICLE_MAX_PAGE,
  ARTICLE_MAX_PAGE_SIZE,
  ArticlePageQueryDto,
  ArticlesAvailabilityQueryDto,
  AVAILABILITY_MAX_ARTICLES,
  parseArticleIdentities,
} from './articles.dto';

describe('parseArticleIdentities', () => {
  it('returns an empty list for an absent or blank value', () => {
    expect(parseArticleIdentities(undefined)).toEqual([]);
    expect(parseArticleIdentities('')).toEqual([]);
    expect(parseArticleIdentities('  ,  ')).toEqual([]);
  });

  it('splits, trims and de-duplicates the comma-separated articles', () => {
    expect(parseArticleIdentities(' 30:A1 , 1:A2 ,30:A1, ')).toEqual([
      { brandId: '30', articleNumber: 'A1' },
      { brandId: '1', articleNumber: 'A2' },
    ]);
  });

  // The same number under two brands is two different parts, so it must survive
  // de-duplication as two entries.
  it('keeps one number filed by two brands apart', () => {
    expect(parseArticleIdentities('30:WL6340,1:WL6340')).toEqual([
      { brandId: '30', articleNumber: 'WL6340' },
      { brandId: '1', articleNumber: 'WL6340' },
    ]);
  });

  // A brand id is digits only, so everything after the first colon is number.
  it('splits on the first colon so a number may contain one', () => {
    expect(parseArticleIdentities('30:A:1')).toEqual([
      { brandId: '30', articleNumber: 'A:1' },
    ]);
  });

  // A query string can express the same list either way, and the de-duplication
  // has to span both forms.
  it('accepts the repeated-param form and de-duplicates across entries', () => {
    expect(parseArticleIdentities(['30:A1,30:A2', ' 30:A2 ', '30:A3'])).toEqual(
      [
        { brandId: '30', articleNumber: 'A1' },
        { brandId: '30', articleNumber: 'A2' },
        { brandId: '30', articleNumber: 'A3' },
      ],
    );
  });

  it('ignores entries that are not strings', () => {
    expect(parseArticleIdentities([1, null, '30:A1'])).toEqual([
      { brandId: '30', articleNumber: 'A1' },
    ]);
  });

  // Kept rather than dropped, so the DTO can reject it: a caller that sent half
  // an identity has a bug, and a shorter answer would hide it.
  it('keeps a token that carries no brand', () => {
    expect(parseArticleIdentities('A1')).toEqual([
      { brandId: '', articleNumber: 'A1' },
    ]);
  });
});

describe('ArticlesAvailabilityQueryDto', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(ArticlesAvailabilityQueryDto, query);

  const failedProperties = (dto: ArticlesAvailabilityQueryDto) =>
    validateSync(dto).map((error) => error.property);

  it('parses a comma-separated batch', () => {
    const dto = toDto({ articles: '30:WL6340,1:OC115' });

    expect(failedProperties(dto)).toEqual([]);
    expect(dto.articles).toEqual([
      { brandId: '30', articleNumber: 'WL6340' },
      { brandId: '1', articleNumber: 'OC115' },
    ]);
  });

  it('accepts a batch at the cap', () => {
    const articles = Array.from(
      { length: AVAILABILITY_MAX_ARTICLES },
      (_, index) => `30:A${index}`,
    ).join(',');

    expect(failedProperties(toDto({ articles }))).toEqual([]);
  });

  // The response is a map keyed by brand and number, so an empty request would
  // come back as `{}` — indistinguishable from "none of these are in stock",
  // which renders a whole grid as out of stock.
  it.each([
    ['an absent param', {}],
    ['an empty param', { articles: '' }],
    ['a param of only separators', { articles: ' , , ' }],
  ])('rejects %s', (_label, query) => {
    expect(failedProperties(toDto(query))).toContain('articles');
  });

  // Unbounded batches fan out into one `IN (...)` against the shared database on
  // an endpoint that is never cached.
  it('rejects a batch over the cap', () => {
    const articles = Array.from(
      { length: AVAILABILITY_MAX_ARTICLES + 1 },
      (_, index) => `30:A${index}`,
    ).join(',');

    expect(failedProperties(toDto({ articles }))).toContain('articles');
  });

  // Half an identity resolves to whichever brand the catalogue sorted first,
  // which is the bug this endpoint's contract exists to prevent.
  it.each([
    ['an article with no brand', 'WL6340'],
    ['an empty brand', ':WL6340'],
    ['a brand that is not a TecDoc id', 'BOSCH:WL6340'],
    ['an article with no number', '30:'],
    ['a number longer than the limit', `30:${'A'.repeat(51)}`],
  ])('rejects %s', (_label, articles) => {
    expect(failedProperties(toDto({ articles }))).toContain('articles');
  });
});

describe('ArticlePageQueryDto', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(ArticlePageQueryDto, query);

  const failedProperties = (dto: ArticlePageQueryDto) =>
    validateSync(dto).map((error) => error.property);

  it('parses the numbers a query string carries as text', () => {
    const dto = toDto({ page: '3', pageSize: '25' });

    expect(failedProperties(dto)).toEqual([]);
    expect(dto).toEqual({ page: 3, pageSize: 25 });
  });

  // Absent paging is valid; the service supplies the first page and its default
  // size, so the DTO only has to bound what a caller did send.
  it('accepts an absent page and page size', () => {
    const dto = toDto({});

    expect(failedProperties(dto)).toEqual([]);
    expect(dto.page).toBeUndefined();
    expect(dto.pageSize).toBeUndefined();
  });

  it('accepts the bounds themselves', () => {
    const dto = toDto({
      page: String(ARTICLE_MAX_PAGE),
      pageSize: String(ARTICLE_MAX_PAGE_SIZE),
    });

    expect(failedProperties(dto)).toEqual([]);
  });

  it.each([
    ['a page below one', { page: '0' }, 'page'],
    ['a negative page', { page: '-3' }, 'page'],
    ['a page past the ceiling', { page: String(ARTICLE_MAX_PAGE + 1) }, 'page'],
    ['a fractional page', { page: '1.5' }, 'page'],
    ['a page that is not a number', { page: 'abc' }, 'page'],
    ['a page size below one', { pageSize: '0' }, 'pageSize'],
    [
      'a page size past the ceiling',
      { pageSize: String(ARTICLE_MAX_PAGE_SIZE + 1) },
      'pageSize',
    ],
    ['a page size that is not a number', { pageSize: 'abc' }, 'pageSize'],
  ])('rejects %s', (_label, query, property) => {
    expect(failedProperties(toDto(query))).toContain(property);
  });
});
