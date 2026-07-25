import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  AutocompleteQueryDto,
  parseCriteriaFilters,
  SearchQueryDto,
} from './search.dto';
import { SearchMode } from './search-types';

describe('parseCriteriaFilters', () => {
  it('returns an empty array when the param is absent or empty', () => {
    expect(parseCriteriaFilters(undefined)).toEqual([]);
    expect(parseCriteriaFilters([])).toEqual([]);
  });

  it('parses a criteriaId:rawValue pair', () => {
    expect(parseCriteriaFilters(['20:106.4'])).toEqual([
      { criteriaId: '20', rawValue: '106.4' },
    ]);
  });

  it('parses multiple pairs', () => {
    expect(parseCriteriaFilters(['20:106.4', '44:Отпред'])).toEqual([
      { criteriaId: '20', rawValue: '106.4' },
      { criteriaId: '44', rawValue: 'Отпред' },
    ]);
  });

  it('splits on the first colon so the rawValue may contain colons', () => {
    expect(parseCriteriaFilters(['12:a:b:c'])).toEqual([
      { criteriaId: '12', rawValue: 'a:b:c' },
    ]);
  });

  it('drops entries with no colon, a leading colon, or an empty value', () => {
    expect(
      parseCriteriaFilters(['nocolon', ':orphan', '20:', '30:ok']),
    ).toEqual([{ criteriaId: '30', rawValue: 'ok' }]);
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
