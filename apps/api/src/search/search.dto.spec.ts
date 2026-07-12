import 'reflect-metadata';
import { parseCriteriaFilters } from './search.dto';

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
