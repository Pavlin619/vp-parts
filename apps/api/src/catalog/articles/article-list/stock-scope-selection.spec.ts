import { StockScope } from '@vp-parts-shop/shared';
import {
  countStockScopes,
  keepInStockScope,
  selectStockScope,
} from './stock-scope-selection';

interface TestArticle {
  articleNumber: string;
  stockScopes?: StockScope[];
}

function article(
  articleNumber: string,
  ...stockScopes: StockScope[]
): TestArticle {
  return { articleNumber, stockScopes };
}

/** What a set looks like when the stock read behind the ranking failed. */
function unknown(articleNumber: string): TestArticle {
  return { articleNumber };
}

function numbersOf(articles: TestArticle[]): string[] {
  return articles.map((entry) => entry.articleNumber);
}

describe('countStockScopes', () => {
  it('counts every article in the set as `all`', () => {
    const counts = countStockScopes([
      article('A', 'central'),
      article('B'),
      article('C'),
    ]);

    expect(counts.all).toBe(3);
  });

  // The two origins are predicates over one article, not segments of the set:
  // a number on our shelf that a supplier also holds belongs to both.
  it('counts an article held in both origins under each of them', () => {
    const counts = countStockScopes([article('A', 'central', 'external')]);

    expect(counts).toEqual({ all: 1, central: 1, external: 1 });
  });

  it('counts an article no origin can ship under neither', () => {
    const counts = countStockScopes([article('A')]);

    expect(counts).toEqual({ all: 1, central: 0, external: 0 });
  });

  it('counts an empty set as zero of everything', () => {
    expect(countStockScopes([])).toEqual({ all: 0, central: 0, external: 0 });
  });
});

describe('keepInStockScope', () => {
  const set = [
    article('OWN', 'central'),
    article('BOTH', 'central', 'external'),
    article('SUPPLIER', 'external'),
    article('NOWHERE'),
  ];

  it('keeps what the central warehouse holds', () => {
    expect(numbersOf(keepInStockScope(set, 'central'))).toEqual([
      'OWN',
      'BOTH',
    ]);
  });

  it('keeps what the other warehouses hold', () => {
    expect(numbersOf(keepInStockScope(set, 'external'))).toEqual([
      'BOTH',
      'SUPPLIER',
    ]);
  });

  // Narrowing removes rows from a ranking; it does not get to re-rank the rest.
  it('leaves the order it was given untouched', () => {
    const reversed = [...set].reverse();

    expect(numbersOf(keepInStockScope(reversed, 'central'))).toEqual([
      'BOTH',
      'OWN',
    ]);
  });
});

describe('selectStockScope', () => {
  const set = [
    article('OWN', 'central'),
    article('BOTH', 'central', 'external'),
    article('SUPPLIER', 'external'),
  ];

  it('returns the whole set and its breakdown when no origin is asked for', () => {
    const selection = selectStockScope(set);

    expect(numbersOf(selection.articles)).toEqual(['OWN', 'BOTH', 'SUPPLIER']);
    expect(selection.counts).toEqual({ all: 3, central: 2, external: 2 });
  });

  // The counts label the control, so they have to describe the set the control
  // narrows — not the one it already narrowed, which would make every option
  // read as the current selection.
  it('counts the unnarrowed set even while narrowing it', () => {
    const selection = selectStockScope(set, 'central');

    expect(numbersOf(selection.articles)).toEqual(['OWN', 'BOTH']);
    expect(selection.counts).toEqual({ all: 3, central: 2, external: 2 });
  });

  it('answers an empty set with an empty breakdown', () => {
    const selection = selectStockScope([], 'central');

    expect(selection.articles).toEqual([]);
    expect(selection.counts).toEqual({ all: 0, central: 0, external: 0 });
  });

  // A stock outage costs the list its narrowing, never its rows: null counts are
  // what tell the client the control is not on offer.
  it('serves the set unnarrowed with no breakdown when the origins are unknown', () => {
    const selection = selectStockScope([unknown('A'), unknown('B')], 'central');

    expect(numbersOf(selection.articles)).toEqual(['A', 'B']);
    expect(selection.counts).toBeNull();
  });
});
