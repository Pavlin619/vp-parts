import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SEARCH_SORTS, SearchSort } from '@vp-parts-shop/shared';
import {
  AutocompleteQueryDto,
  parseCriteriaFilters,
  SearchQueryDto,
} from './search.dto';
import { SearchMode } from './search-types';
import { MERGED_VALUE_SEPARATOR } from './dimension-facets';

describe('parseCriteriaFilters', () => {
  it('returns an empty array when the param is absent or empty', () => {
    expect(parseCriteriaFilters(undefined)).toEqual([]);
    expect(parseCriteriaFilters([])).toEqual([]);
  });

  // The criteriaId is parsed here, not downstream: it goes into the TecDoc
  // payload as a number, so this is the boundary that has to produce one.
  it('parses a criteriaId:rawValue pair into a numeric id', () => {
    expect(parseCriteriaFilters(['20:106.4'])).toEqual([
      { criteriaId: 20, rawValue: '106.4' },
    ]);
  });

  it('parses multiple pairs', () => {
    expect(parseCriteriaFilters(['20:106.4', '44:Отпред'])).toEqual([
      { criteriaId: 20, rawValue: '106.4' },
      { criteriaId: 44, rawValue: 'Отпред' },
    ]);
  });

  it('splits on the first colon so the rawValue may contain colons', () => {
    expect(parseCriteriaFilters(['12:a:b:c'])).toEqual([
      { criteriaId: 12, rawValue: 'a:b:c' },
    ]);
  });

  it('drops entries with no colon, a leading colon, or an empty value', () => {
    expect(
      parseCriteriaFilters(['nocolon', ':orphan', '20:', '30:ok']),
    ).toEqual([{ criteriaId: 30, rawValue: 'ok' }]);
  });

  // An unparseable criteriaId would be sent as `criteriaId: null`, which TecDoc
  // reads as a different filter rather than as no filter at all.
  it('drops entries whose criteriaId is not a positive integer', () => {
    expect(
      parseCriteriaFilters([
        'width:106.4',
        '0:zero',
        '-2:neg',
        '1.5:fraction',
        '30:ok',
      ]),
    ).toEqual([{ criteriaId: 30, rawValue: 'ok' }]);
  });

  // One pill can stand for several raw spellings of one measurement, and the
  // filter has to name every one of them or it narrows to the fraction of
  // articles filed under the spelling that happened to win the label.
  it('expands a merged value into one filter per raw spelling', () => {
    expect(
      parseCriteriaFilters([`206:193${MERGED_VALUE_SEPARATOR}193,0`]),
    ).toEqual([
      { criteriaId: 206, rawValue: '193' },
      { criteriaId: 206, rawValue: '193,0' },
    ]);
  });

  it('drops an entry that is nothing but separators', () => {
    expect(parseCriteriaFilters([`206:${MERGED_VALUE_SEPARATOR}`])).toEqual([]);
  });
});

describe('SearchQueryDto TecDoc ids', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(SearchQueryDto, query);

  const failedProperties = (dto: SearchQueryDto) =>
    validateSync(dto).map((error) => error.property);

  // A query string only carries text, so the DTO is where ids become numbers —
  // everything downstream, including the TecDoc payload, takes them as given.
  it('parses numeric ids into numbers', () => {
    const dto = toDto({
      q: 'WL6340',
      vehicleId: '10001',
      brandIds: ['72', '635'],
      categoryNodeId: '100002',
    });

    expect(failedProperties(dto)).toEqual([]);
    expect(dto.vehicleId).toBe(10001);
    expect(dto.brandIds).toEqual([72, 635]);
    expect(dto.categoryNodeId).toBe(100002);
  });

  it('accepts a search with no ids at all', () => {
    expect(failedProperties(toDto({ q: 'WL6340' }))).toEqual([]);
  });

  // An unparseable id becomes NaN, which `JSON.stringify` writes as `null` — so
  // without this it would reach TecDoc as an absent filter and silently widen
  // the query instead of failing it.
  it.each([
    ['vehicleId', { vehicleId: 'abc' }],
    ['vehicleId', { vehicleId: '0' }],
    ['vehicleId', { vehicleId: '-1' }],
    ['categoryNodeId', { categoryNodeId: '1.5' }],
    ['brandIds', { brandIds: ['72', 'bosch'] }],
    ['brandIds', { brandIds: ['0'] }],
  ])('rejects a non-id %s', (property, query) => {
    expect(failedProperties(toDto({ q: 'WL6340', ...query }))).toContain(
      property,
    );
  });
});

describe('SearchQueryDto q', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(SearchQueryDto, query);

  const failedProperties = (dto: SearchQueryDto) =>
    validateSync(dto).map((error) => error.property);

  it('trims the typed query', () => {
    expect(toDto({ q: '  WL6340  ' }).q).toBe('WL6340');
  });

  // "Nothing was typed" is one value inwards, so no consumer has to handle both
  // an absent param and an empty one.
  it('reads an absent param as an empty query', () => {
    expect(toDto({ vehicleId: '10001' }).q).toBe('');
  });

  /**
   * The catalogue page sends a vehicle and a category with nothing typed. TecDoc
   * answers it in full — the Audi A3's oil filters are 119 articles with every
   * facet — so refusing it here was the only thing standing in the way.
   */
  it.each([
    [
      'a vehicle and a category',
      { vehicleId: '11340', categoryNodeId: '100259' },
    ],
    ['a category alone', { categoryNodeId: '100259' }],
    ['a vehicle alone', { vehicleId: '11340' }],
  ])('accepts an empty query narrowed by %s', (_label, query) => {
    expect(failedProperties(toDto(query))).toEqual([]);
  });

  // An empty query with nothing to narrow it is the whole catalogue, which no
  // surface asks for and TecDoc pages only the first ~10,000 of.
  it.each([{}, { q: '' }, { q: '   ' }, { q: '', sort: SearchSort.Catalogue }])(
    'rejects an empty query with nothing to narrow it: %p',
    (query) => {
      expect(failedProperties(toDto(query))).toContain('q');
    },
  );

  // A brand or a product type is only ever echoed back from a facet block a
  // previous search served, so neither can be the thing a search starts from.
  it.each([
    ['brandIds', { brandIds: ['72'] }],
    ['productTypeIds', { productTypeIds: ['1234'] }],
    ['stock', { stock: 'central' }],
  ])('does not accept %s as a substitute for a query', (_label, query) => {
    expect(failedProperties(toDto(query))).toContain('q');
  });

  it('still bounds a query that is present', () => {
    expect(
      failedProperties(toDto({ q: 'x'.repeat(201), vehicleId: '11340' })),
    ).toContain('q');
  });

  // Left for `@IsString` to refuse rather than collapsed to '', or a repeated
  // param would quietly become a browse of the whole catalogue.
  it('rejects a repeated q param instead of reading it as empty', () => {
    expect(failedProperties(toDto({ q: ['a', 'b'] }))).toContain('q');
  });
});

describe('SearchQueryDto searchMode', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(SearchQueryDto, query);

  it('is undefined when the param is absent (service applies the default)', () => {
    expect(toDto({ q: 'WL6340' }).searchMode).toBeUndefined();
  });

  it('accepts every supported mode and validates', () => {
    for (const mode of [
      SearchMode.PartNumber,
      SearchMode.PartNumberExact,
      SearchMode.Generic,
    ]) {
      const dto = toDto({ q: 'WL6340', searchMode: mode });
      expect(dto.searchMode).toBe(mode);
      expect(validateSync(dto)).toHaveLength(0);
    }
  });

  it('rejects an unsupported mode', () => {
    const dto = toDto({ q: 'WL6340', searchMode: 'fuzzy' });
    const errors = validateSync(dto);
    expect(errors.some((error) => error.property === 'searchMode')).toBe(true);
  });
});

describe('SearchQueryDto categoryHasChildren', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(SearchQueryDto, query);

  it('is undefined when the param is absent', () => {
    expect(toDto({ q: 'WL6340' }).categoryHasChildren).toBeUndefined();
  });

  it('parses the string forms a query string can carry', () => {
    expect(
      toDto({ q: 'WL6340', categoryHasChildren: 'true' }).categoryHasChildren,
    ).toBe(true);
    expect(
      toDto({ q: 'WL6340', categoryHasChildren: 'false' }).categoryHasChildren,
    ).toBe(false);
  });

  it('validates once parsed', () => {
    const dto = toDto({ q: 'WL6340', categoryHasChildren: 'false' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  // The param is a performance hint, never a correctness input, so a malformed
  // value degrades to "absent" rather than 400ing an otherwise valid search.
  it('falls back to undefined for an unparseable value', () => {
    const dto = toDto({ q: 'WL6340', categoryHasChildren: 'maybe' });
    expect(dto.categoryHasChildren).toBeUndefined();
    expect(validateSync(dto)).toHaveLength(0);
  });
});

describe('SearchQueryDto stock', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(SearchQueryDto, query);

  it('is undefined when the param is absent, which means every origin', () => {
    expect(toDto({ q: 'WL6340' }).stock).toBeUndefined();
  });

  it.each(['central', 'external'])('accepts %s', (scope) => {
    const dto = toDto({ q: 'WL6340', stock: scope });

    expect(dto.stock).toBe(scope);
    expect(validateSync(dto)).toHaveLength(0);
  });

  // Unlike the facet params this is not an id we served back, so widening it
  // quietly would serve an unnarrowed list under a control saying otherwise.
  it('rejects an origin it does not recognise', () => {
    const errors = validateSync(toDto({ q: 'WL6340', stock: 'warehouse-3' }));

    expect(errors.some((error) => error.property === 'stock')).toBe(true);
  });
});

describe('SearchQueryDto sort', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(SearchQueryDto, query);

  it('is undefined when the param is absent (service applies the default)', () => {
    expect(toDto({ q: 'WL6340' }).sort).toBeUndefined();
  });

  it.each(SEARCH_SORTS)('accepts %s', (sort) => {
    const dto = toDto({ q: 'WL6340', sort });

    expect(dto.sort).toBe(sort);
    expect(validateSync(dto)).toHaveLength(0);
  });

  // Falling back to the default would answer a different question from the one
  // asked, under a control saying otherwise.
  it('rejects an order it does not offer', () => {
    const errors = validateSync(toDto({ q: 'WL6340', sort: 'cheapest' }));

    expect(errors.some((error) => error.property === 'sort')).toBe(true);
  });

  /**
   * Asking a wide set for an order it cannot be served in is not a client error
   * — the response reports which order it fell back to. Rejecting it here would
   * make the tier something the client had to know before it could ask.
   */
  it('accepts a stock-based order without knowing how wide the set is', () => {
    const errors = validateSync(
      toDto({ q: 'филтър', sort: SearchSort.PriceAscending }),
    );

    expect(errors).toHaveLength(0);
  });
});

describe('AutocompleteQueryDto searchMode', () => {
  const toDto = (query: Record<string, unknown>) =>
    plainToInstance(AutocompleteQueryDto, query);

  it('is undefined when the param is absent (service applies the default)', () => {
    expect(toDto({ q: 'WL6' }).searchMode).toBeUndefined();
  });

  it('accepts every supported mode and validates', () => {
    for (const mode of [
      SearchMode.PartNumber,
      SearchMode.PartNumberExact,
      SearchMode.Generic,
    ]) {
      const dto = toDto({ q: 'WL6', searchMode: mode });
      expect(dto.searchMode).toBe(mode);
      expect(validateSync(dto)).toHaveLength(0);
    }
  });

  it('rejects an unsupported mode', () => {
    const dto = toDto({ q: 'WL6', searchMode: 'fuzzy' });
    const errors = validateSync(dto);
    expect(errors.some((error) => error.property === 'searchMode')).toBe(true);
  });
});
