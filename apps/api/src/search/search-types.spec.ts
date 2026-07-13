import {
  attributeRoleFor,
  FITTING_POSITION_CRITERIA_ID,
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
