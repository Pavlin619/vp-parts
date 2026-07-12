import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { parseCriteriaFilters, SearchQueryDto } from './search.dto';

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

describe('SearchQueryDto exact toggle', () => {
  const parseExact = (query: Record<string, unknown>) =>
    plainToInstance(SearchQueryDto, query).exact;

  it('is undefined when the param is absent', () => {
    expect(parseExact({ q: 'WL6340' })).toBeUndefined();
  });

  it('coerces the truthy string forms to true', () => {
    expect(parseExact({ q: 'WL6340', exact: 'true' })).toBe(true);
    expect(parseExact({ q: 'WL6340', exact: '1' })).toBe(true);
    expect(parseExact({ q: 'WL6340', exact: true })).toBe(true);
  });

  it('coerces any other value to false', () => {
    expect(parseExact({ q: 'WL6340', exact: 'false' })).toBe(false);
    expect(parseExact({ q: 'WL6340', exact: '0' })).toBe(false);
    expect(parseExact({ q: 'WL6340', exact: 'yes' })).toBe(false);
  });
});
