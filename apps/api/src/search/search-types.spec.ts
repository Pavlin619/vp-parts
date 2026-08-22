import {
  attributeRoleFor,
  FITTING_POSITION_CRITERIA_ID,
  hasActiveFilters,
  hasSingleProductType,
  shouldRequestCriteriaFacets,
  TecDocSearchType,
} from './search-types';

describe('attributeRoleFor', () => {
  it('maps the fitting-position criteriaId to the fitting-position role', () => {
    expect(attributeRoleFor(FITTING_POSITION_CRITERIA_ID)).toBe(
      'fitting-position',
    );
  });

  it('maps the Bulgarian fitting-position label used by the mock', () => {
    expect(attributeRoleFor('Позиция на монтаж')).toBe('fitting-position');
  });

  it('returns null for an unmapped criteriaId', () => {
    expect(attributeRoleFor('9999')).toBeNull();
  });
});

describe('TecDocSearchType', () => {
  it('exposes the any-number and free-text search-type codes', () => {
    expect(TecDocSearchType.AnyNumber).toBe(10);
    expect(TecDocSearchType.FreeText).toBe(99);
  });
});

describe('shouldRequestCriteriaFacets', () => {
  const FIRST_PAGE = 1;

  it('is false for a broad search with no selected category', () => {
    expect(shouldRequestCriteriaFacets({}, FIRST_PAGE)).toBe(false);
    expect(shouldRequestCriteriaFacets(undefined, FIRST_PAGE)).toBe(false);
  });

  it('is false when the client reports the selected category has children', () => {
    expect(
      shouldRequestCriteriaFacets(
        { categoryNodeId: 100, categoryHasChildren: true },
        FIRST_PAGE,
      ),
    ).toBe(false);
  });

  it('is true when the client reports the selected category is a leaf', () => {
    expect(
      shouldRequestCriteriaFacets(
        { categoryNodeId: 100, categoryHasChildren: false },
        FIRST_PAGE,
      ),
    ).toBe(true);
  });

  // Dimensions are strictly opt-in: a caller that never asked is never charged
  // for the criteria block.
  it('is false when the hint is absent', () => {
    expect(
      shouldRequestCriteriaFacets({ categoryNodeId: 100 }, FIRST_PAGE),
    ).toBe(false);
  });

  it('is false beyond the first page, where facets repeat the first page verbatim', () => {
    expect(
      shouldRequestCriteriaFacets(
        { categoryNodeId: 100, categoryHasChildren: false },
        2,
      ),
    ).toBe(false);
  });

  // TecDoc defines criteria per generic article, so one selected product type
  // is a homogeneous set on its own — no category needed.
  it('is true for a single product type with no category selected', () => {
    expect(
      shouldRequestCriteriaFacets({ productTypeIds: [42] }, FIRST_PAGE),
    ).toBe(true);
  });

  it('is false for two product types, whose criteria sets are a union', () => {
    expect(
      shouldRequestCriteriaFacets({ productTypeIds: [42, 43] }, FIRST_PAGE),
    ).toBe(false);
  });

  it('is false for a single product type beyond the first page', () => {
    expect(shouldRequestCriteriaFacets({ productTypeIds: [42] }, 2)).toBe(
      false,
    );
  });

  // The two qualifying signals are independent: a product type still opens the
  // gate under a mid-level category the leaf hint would refuse.
  it('is true for a single product type under a branch category', () => {
    expect(
      shouldRequestCriteriaFacets(
        {
          productTypeIds: [42],
          categoryNodeId: 100,
          categoryHasChildren: true,
        },
        FIRST_PAGE,
      ),
    ).toBe(true);
  });
});

describe('hasSingleProductType', () => {
  it('is true for exactly one selected product type', () => {
    expect(hasSingleProductType({ productTypeIds: [42] })).toBe(true);
  });

  it('is false for none, several, or no filters at all', () => {
    expect(hasSingleProductType({ productTypeIds: [] })).toBe(false);
    expect(hasSingleProductType({ productTypeIds: [42, 43] })).toBe(false);
    expect(hasSingleProductType({})).toBe(false);
    expect(hasSingleProductType(undefined)).toBe(false);
  });
});

describe('hasActiveFilters', () => {
  it('is false for a search with no narrowing at all', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters(undefined)).toBe(false);
  });

  it('is false for empty selection groups', () => {
    expect(hasActiveFilters({ brandIds: [], criteria: [] })).toBe(false);
  });

  it('is true when a brand is selected', () => {
    expect(hasActiveFilters({ brandIds: [4] })).toBe(true);
  });

  it('is true when a category is selected', () => {
    expect(hasActiveFilters({ categoryNodeId: 100 })).toBe(true);
  });

  it('is true when a product type is selected', () => {
    expect(hasActiveFilters({ productTypeIds: [42] })).toBe(true);
  });

  it('is true when a technical attribute is selected', () => {
    expect(
      hasActiveFilters({ criteria: [{ criteriaId: 20, rawValue: '106.4' }] }),
    ).toBe(true);
  });

  // The leafness hint describes a selection, it is not one itself — on its own
  // it narrows nothing.
  it('is false for a bare leafness hint with no category selected', () => {
    expect(hasActiveFilters({ categoryHasChildren: false })).toBe(false);
  });
});
