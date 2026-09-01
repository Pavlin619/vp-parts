import {
  SEARCH_SORTABLE_LIMIT,
  SearchEnumeration,
  isSortableSet,
  resolveMaxPage,
  withoutCandidates,
} from './search-enumeration';

describe('isSortableSet', () => {
  it('orders a set that fits in one enumeration', () => {
    expect(isSortableSet(1)).toBe(true);
    expect(isSortableSet(SEARCH_SORTABLE_LIMIT)).toBe(true);
  });

  // One match past the ceiling and the enumeration is already truncated, so a
  // ranking built on it would rank a set nobody can see the rest of.
  it('leaves a set one match past the ceiling in TecDoc’s order', () => {
    expect(isSortableSet(SEARCH_SORTABLE_LIMIT + 1)).toBe(false);
  });

  // A search with nothing in it is trivially ordered, and answering `false`
  // would send an empty result down the fallback path for no reason.
  it('treats an empty set as sortable', () => {
    expect(isSortableSet(0)).toBe(true);
  });
});

describe('resolveMaxPage', () => {
  // An ordered set is paged out of an enumeration we hold, so every page of it
  // is reachable and TecDoc's ceiling never comes into it.
  it('counts the pages of a set with no ceiling reported', () => {
    expect(resolveMaxPage(45, 20)).toBe(3);
    expect(resolveMaxPage(40, 20)).toBe(2);
    expect(resolveMaxPage(0, 20)).toBe(0);
  });

  /**
   * The bound a pager has to be sized from: a broad query reports millions of
   * matches and still refuses page 501, so the page count alone would offer
   * pages TecDoc will not serve.
   */
  it('never offers a page past TecDoc’s ceiling', () => {
    expect(resolveMaxPage(6_943_670, 20, 500)).toBe(500);
  });

  // TecDoc factors the match count into its own cap, so the minimum only guards
  // against it not doing so.
  it('never offers a page past the end of the set either', () => {
    expect(resolveMaxPage(45, 20, 500)).toBe(3);
  });
});

describe('withoutCandidates', () => {
  const enumeration: SearchEnumeration = {
    total: 6_943_670,
    candidates: [
      {
        brandId: '30',
        brandName: 'BOSCH',
        articleNumber: 'A1',
        description: 'Спирачен диск',
        legacyArticleIds: [555],
        articleStatusId: 1,
      },
    ],
    facets: [{ id: 'brands', values: [] }],
    attributes: [],
    categoryNavigation: { current: null, ancestors: [], options: [] },
  };

  it('keeps what the facets and the pager need', () => {
    expect(withoutCandidates(enumeration)).toEqual({
      ...enumeration,
      candidates: [],
    });
  });

  it('leaves the enumeration it was given alone', () => {
    withoutCandidates(enumeration);

    expect(enumeration.candidates).toHaveLength(1);
  });
});
