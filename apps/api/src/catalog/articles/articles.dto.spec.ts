import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
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
