import { officeHoursOf } from './econt-office-hours';

const at = (iso: string) => new Date(iso).getTime();

describe('officeHoursOf', () => {
  it('reads Econt instants as Bulgarian wall-clock times', () => {
    expect(
      officeHoursOf(at('2026-09-24T06:00:00Z'), at('2026-09-24T15:00:00Z')),
    ).toEqual({ opensAt: '09:00', closesAt: '18:00' });
  });

  it('follows Bulgarian winter time', () => {
    expect(
      officeHoursOf(at('2026-12-01T07:00:00Z'), at('2026-12-01T16:30:00Z')),
    ).toEqual({ opensAt: '09:00', closesAt: '18:30' });
  });

  it('keeps a round-the-clock locker as 00:00–23:59', () => {
    expect(
      officeHoursOf(at('2026-09-23T21:00:00Z'), at('2026-09-24T20:59:00Z')),
    ).toEqual({ opensAt: '00:00', closesAt: '23:59' });
  });

  it('has no hours when either end is missing', () => {
    expect(officeHoursOf(null, at('2026-09-24T15:00:00Z'))).toBeNull();
    expect(officeHoursOf(at('2026-09-24T06:00:00Z'), null)).toBeNull();
  });
});
