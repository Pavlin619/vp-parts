import {
  attributeRoleFor,
  FITTING_POSITION_CRITERIA_ID,
  hasSingleProductType,
  isFacetPage,
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
  it('is false for a broad search with no selected category', () => {
    expect(shouldRequestCriteriaFacets({})).toBe(false);
    expect(shouldRequestCriteriaFacets(undefined)).toBe(false);
  });

  it('is false when the client reports the selected category has children', () => {
    expect(
      shouldRequestCriteriaFacets({
        categoryNodeId: 100,
        categoryHasChildren: true,
      }),
    ).toBe(false);
  });

  it('is true when the client reports the selected category is a leaf', () => {
    expect(
      shouldRequestCriteriaFacets({
        categoryNodeId: 100,
        categoryHasChildren: false,
      }),
    ).toBe(true);
  });

  // Dimensions are strictly opt-in: a caller that never asked is never charged
  // for the criteria block.
  it('is false when the hint is absent', () => {
    expect(shouldRequestCriteriaFacets({ categoryNodeId: 100 })).toBe(false);
  });

  // TecDoc defines criteria per generic article, so one selected product type
  // is a homogeneous set on its own — no category needed.
  it('is true for a single product type with no category selected', () => {
    expect(shouldRequestCriteriaFacets({ productTypeIds: [42] })).toBe(true);
  });

  it('is false for two product types, whose criteria sets are a union', () => {
    expect(shouldRequestCriteriaFacets({ productTypeIds: [42, 43] })).toBe(
      false,
    );
  });

  // The two qualifying signals are independent: a product type still opens the
  // gate under a mid-level category the leaf hint would refuse.
  it('is true for a single product type under a branch category', () => {
    expect(
      shouldRequestCriteriaFacets({
        productTypeIds: [42],
        categoryNodeId: 100,
        categoryHasChildren: true,
      }),
    ).toBe(true);
  });
});

describe('isFacetPage', () => {
  // The attribute block describes the whole match set, so only the first page
  // carries it and the client keeps it while paginating.
  it('is the first page alone', () => {
    expect(isFacetPage(1)).toBe(true);
    expect(isFacetPage(2)).toBe(false);
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
