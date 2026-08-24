import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ARTICLE_MAX_PAGE,
  ARTICLE_MAX_PAGE_SIZE,
  ArticlePageQueryDto,
  ArticlesAvailabilityQueryDto,
  AVAILABILITY_MAX_ARTICLE_NUMBERS,
  parseArticleNumbers,
} from './articles.dto';

describe('parseArticleNumbers', () => {
  it('returns an empty list for an absent or blank value', () => {
    expect(parseArticleNumbers(undefined)).toEqual([]);
    expect(parseArticleNumbers('')).toEqual([]);
    expect(parseArticleNumbers('  ,  ')).toEqual([]);
  });

  it('splits, trims and de-duplicates the comma-separated numbers', () => {
    expect(parseArticleNumbers(' A1 , A2 ,A1, ')).toEqual(['A1', 'A2']);
  });

  // A query string can express the same list either way, and the de-duplication
  // has to span both forms.
  it('accepts the repeated-param form and de-duplicates across entries', () => {
    expect(parseArticleNumbers(['A1,A2', ' A2 ', 'A3'])).toEqual([
      'A1',
      'A2',
      'A3',
    ]);
  });

  it('ignores entries that are not strings', () => {
    expect(parseArticleNumbers([1, null, 'A1'])).toEqual(['A1']);
  });
});

describe('ArticlesAvailabilityQueryDto', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(ArticlesAvailabilityQueryDto, query);

  const failedProperties = (dto: ArticlesAvailabilityQueryDto) =>
    validateSync(dto).map((error) => error.property);

  it('parses a comma-separated batch', () => {
    const dto = toDto({ numbers: 'WL6340,OC115' });

    expect(failedProperties(dto)).toEqual([]);
    expect(dto.numbers).toEqual(['WL6340', 'OC115']);
  });

  it('accepts a batch at the cap', () => {
    const numbers = Array.from(
      { length: AVAILABILITY_MAX_ARTICLE_NUMBERS },
      (_, index) => `A${index}`,
    ).join(',');

    expect(failedProperties(toDto({ numbers }))).toEqual([]);
  });

  // The response is a map keyed by article number, so an empty request would
  // come back as `{}` — indistinguishable from "none of these are in stock",
  // which renders a whole grid as out of stock.
  it.each([
    ['an absent param', {}],
    ['an empty param', { numbers: '' }],
    ['a param of only separators', { numbers: ' , , ' }],
  ])('rejects %s', (_label, query) => {
    expect(failedProperties(toDto(query))).toContain('numbers');
  });

  // Unbounded batches fan out into one `IN (...)` against the shared database on
  // an endpoint that is never cached.
  it('rejects a batch over the cap', () => {
    const numbers = Array.from(
      { length: AVAILABILITY_MAX_ARTICLE_NUMBERS + 1 },
      (_, index) => `A${index}`,
    ).join(',');

    expect(failedProperties(toDto({ numbers }))).toContain('numbers');
  });

  it('rejects an article number longer than the limit', () => {
    expect(failedProperties(toDto({ numbers: 'A'.repeat(51) }))).toContain(
      'numbers',
    );
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
