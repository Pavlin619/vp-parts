import { parseArticleNumbers } from './articles.controller';

describe('parseArticleNumbers', () => {
  it('returns an empty list for an absent or blank value', () => {
    expect(parseArticleNumbers(undefined)).toEqual([]);
    expect(parseArticleNumbers('')).toEqual([]);
    expect(parseArticleNumbers('  ,  ')).toEqual([]);
  });

  it('splits, trims and de-duplicates the comma-separated numbers', () => {
    expect(parseArticleNumbers(' A1 , A2 ,A1, ')).toEqual(['A1', 'A2']);
  });
});
