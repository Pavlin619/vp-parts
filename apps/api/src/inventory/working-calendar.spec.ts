import {
  type CivilDate,
  type ShopCalendarConfig,
  addCalendarDays,
  addWorkingDays,
  bgPublicHolidayPredicate,
  civilDateKey,
  hoursFor,
  isShopOpenOn,
  nextOpenDayOnOrAfter,
  shopCivilToInstant,
  toShopCivil,
  weekdayOf,
} from './working-calendar';

const SOFIA = 'Europe/Sofia';

// Mon-Fri 09-18, Sat 09-14, Sun closed. Weekday index 0=Sun..6=Sat.
const WEEKLY = [
  null,
  { openHour: 9, closeHour: 18 },
  { openHour: 9, closeHour: 18 },
  { openHour: 9, closeHour: 18 },
  { openHour: 9, closeHour: 18 },
  { openHour: 9, closeHour: 18 },
  { openHour: 9, closeHour: 14 },
];

function config(
  overrides: Partial<ShopCalendarConfig> = {},
): ShopCalendarConfig {
  return {
    timeZone: SOFIA,
    weeklyHours: WEEKLY,
    isHoliday: () => false,
    ...overrides,
  };
}

const date = (year: number, month: number, day: number): CivilDate => ({
  year,
  month,
  day,
});

describe('working-calendar', () => {
  describe('toShopCivil (timezone safety)', () => {
    it('reads shop-local civil parts regardless of the server clock', () => {
      // 08:00 UTC is 11:00 in Sofia (UTC+3 in summer).
      const civil = toShopCivil(new Date('2026-06-25T08:00:00Z'), SOFIA);
      expect(civil).toMatchObject({
        year: 2026,
        month: 6,
        day: 25,
        hour: 11,
        minute: 0,
        weekday: 4, // Thursday
      });
    });

    it('rolls the local date over at midnight Sofia, not UTC midnight', () => {
      // 22:30 UTC is 01:30 the next day in Sofia (summer).
      const civil = toShopCivil(new Date('2026-06-25T22:30:00Z'), SOFIA);
      expect(civil).toMatchObject({ year: 2026, month: 6, day: 26, hour: 1 });
    });

    it('keeps timezones apart when one instant is read repeatedly', () => {
      const instant = new Date('2026-06-25T22:30:00Z');

      expect(toShopCivil(instant, SOFIA)).toMatchObject({ day: 26, hour: 1 });
      expect(toShopCivil(instant, 'UTC')).toMatchObject({ day: 25, hour: 22 });
      expect(toShopCivil(instant, SOFIA)).toMatchObject({ day: 26, hour: 1 });
    });
  });

  describe('civil date helpers', () => {
    it('formats a civil date key', () => {
      expect(civilDateKey(date(2026, 7, 1))).toBe('2026-07-01');
    });

    it('computes the weekday of a civil date', () => {
      expect(weekdayOf(date(2026, 6, 25))).toBe(4); // Thursday
      expect(weekdayOf(date(2026, 6, 27))).toBe(6); // Saturday
      expect(weekdayOf(date(2026, 6, 28))).toBe(0); // Sunday
    });

    it('adds calendar days across a month boundary', () => {
      expect(addCalendarDays(date(2026, 6, 30), 1)).toEqual(date(2026, 7, 1));
      expect(addCalendarDays(date(2026, 12, 31), 1)).toEqual(date(2027, 1, 1));
    });
  });

  describe('isShopOpenOn / hoursFor', () => {
    it('is open Monday-Saturday and closed on Sunday', () => {
      expect(isShopOpenOn(date(2026, 6, 25), config())).toBe(true); // Thu
      expect(isShopOpenOn(date(2026, 6, 27), config())).toBe(true); // Sat
      expect(isShopOpenOn(date(2026, 6, 28), config())).toBe(false); // Sun
    });

    it('is closed on holidays even on a working weekday', () => {
      const isHoliday = (d: CivilDate) =>
        civilDateKey(d) === civilDateKey(date(2026, 6, 25));
      expect(isShopOpenOn(date(2026, 6, 25), config({ isHoliday }))).toBe(
        false,
      );
    });

    it('returns Saturday hours that differ from weekday hours', () => {
      expect(hoursFor(date(2026, 6, 26), config())).toEqual({
        openHour: 9,
        closeHour: 18,
      }); // Fri
      expect(hoursFor(date(2026, 6, 27), config())).toEqual({
        openHour: 9,
        closeHour: 14,
      }); // Sat
      expect(hoursFor(date(2026, 6, 28), config())).toBeNull(); // Sun
    });
  });

  describe('nextOpenDayOnOrAfter', () => {
    it('returns the same day when it is open', () => {
      expect(nextOpenDayOnOrAfter(date(2026, 6, 25), config())).toEqual(
        date(2026, 6, 25),
      );
    });

    it('skips Sunday to Monday', () => {
      expect(nextOpenDayOnOrAfter(date(2026, 6, 28), config())).toEqual(
        date(2026, 6, 29),
      );
    });

    it('skips a holiday', () => {
      const isHoliday = (d: CivilDate) =>
        civilDateKey(d) === civilDateKey(date(2026, 6, 29)); // Monday holiday
      expect(
        nextOpenDayOnOrAfter(date(2026, 6, 28), config({ isHoliday })),
      ).toEqual(date(2026, 6, 30));
    });
  });

  describe('addWorkingDays', () => {
    it('returns the same day for zero', () => {
      expect(addWorkingDays(date(2026, 6, 25), 0, config())).toEqual(
        date(2026, 6, 25),
      );
    });

    it('counts Saturday as a working day but skips Sunday', () => {
      // Fri 26 + 1 working day = Sat 27 (shop open Saturday).
      expect(addWorkingDays(date(2026, 6, 26), 1, config())).toEqual(
        date(2026, 6, 27),
      );
      // Sat 27 + 1 working day = Mon 29 (Sunday skipped).
      expect(addWorkingDays(date(2026, 6, 27), 1, config())).toEqual(
        date(2026, 6, 29),
      );
    });

    it('skips holidays when counting working days', () => {
      const isHoliday = (d: CivilDate) =>
        civilDateKey(d) === civilDateKey(date(2026, 6, 26)); // Friday holiday
      // Thu 25 + 1 working day skips the Fri holiday -> Sat 27.
      expect(
        addWorkingDays(date(2026, 6, 25), 1, config({ isHoliday })),
      ).toEqual(date(2026, 6, 27));
    });
  });

  describe('shopCivilToInstant (round-trips through the shop timezone)', () => {
    it('converts a summer civil time to the correct UTC instant', () => {
      const instant = shopCivilToInstant(
        { year: 2026, month: 6, day: 25, hour: 11, minute: 0 },
        SOFIA,
      );
      expect(instant.toISOString()).toBe('2026-06-25T08:00:00.000Z');
    });

    it('round-trips back to the same civil parts', () => {
      const civilIn = { year: 2026, month: 7, day: 1, hour: 11, minute: 12 };
      const instant = shopCivilToInstant(civilIn, SOFIA);
      expect(toShopCivil(instant, SOFIA)).toMatchObject(civilIn);
    });

    it('keeps timezones apart when one civil time is converted repeatedly', () => {
      const civil = { year: 2026, month: 6, day: 25, hour: 11, minute: 0 };

      expect(shopCivilToInstant(civil, SOFIA).toISOString()).toBe(
        '2026-06-25T08:00:00.000Z',
      );
      expect(shopCivilToInstant(civil, 'UTC').toISOString()).toBe(
        '2026-06-25T11:00:00.000Z',
      );
      expect(shopCivilToInstant(civil, SOFIA).toISOString()).toBe(
        '2026-06-25T08:00:00.000Z',
      );
    });
  });

  describe('bgPublicHolidayPredicate', () => {
    it('flags fixed Bulgarian public holidays', () => {
      const isHoliday = bgPublicHolidayPredicate(SOFIA);
      expect(isHoliday(date(2026, 1, 1))).toBe(true); // New Year
      expect(isHoliday(date(2026, 3, 3))).toBe(true); // Liberation Day
      expect(isHoliday(date(2026, 5, 1))).toBe(true); // Labour Day
      expect(isHoliday(date(2026, 5, 6))).toBe(true); // St George's / Army
      expect(isHoliday(date(2026, 9, 22))).toBe(true); // Independence Day
      expect(isHoliday(date(2026, 12, 24))).toBe(true); // Christmas Eve
      expect(isHoliday(date(2026, 12, 25))).toBe(true); // Christmas Day
      expect(isHoliday(date(2026, 12, 26))).toBe(true); // 2nd day of Christmas
      expect(isHoliday(date(2026, 7, 1))).toBe(false); // ordinary day
    });

    it('flags the movable Orthodox Easter cluster (2026: Apr 10-13)', () => {
      const isHoliday = bgPublicHolidayPredicate(SOFIA);
      expect(isHoliday(date(2026, 4, 10))).toBe(true); // Good Friday
      expect(isHoliday(date(2026, 4, 11))).toBe(true); // Holy Saturday
      expect(isHoliday(date(2026, 4, 12))).toBe(true); // Easter Sunday
      expect(isHoliday(date(2026, 4, 13))).toBe(true); // Easter Monday
      expect(isHoliday(date(2026, 4, 14))).toBe(false);
    });

    it('tracks the Orthodox Easter cluster across years (2025: Apr 18-21)', () => {
      const isHoliday = bgPublicHolidayPredicate(SOFIA);
      expect(isHoliday(date(2025, 4, 18))).toBe(true); // Good Friday
      expect(isHoliday(date(2025, 4, 21))).toBe(true); // Easter Monday
      expect(isHoliday(date(2024, 5, 3))).toBe(true); // 2024 Good Friday
      expect(isHoliday(date(2024, 5, 6))).toBe(true); // 2024 Easter Monday
    });

    it('adds in-lieu substitute days when a holiday falls on a weekend', () => {
      const isHoliday = bgPublicHolidayPredicate(SOFIA);
      // 2026: 24 May (Sun) -> 25 May, 6 Sep (Sun) -> 7 Sep, 26 Dec (Sat) -> 28 Dec
      expect(isHoliday(date(2026, 5, 25))).toBe(true);
      expect(isHoliday(date(2026, 9, 7))).toBe(true);
      expect(isHoliday(date(2026, 12, 28))).toBe(true);
      // 2025: 24 May (Sat) -> 26 May, 6 Sep (Sat) -> 8 Sep
      expect(isHoliday(date(2025, 5, 26))).toBe(true);
      expect(isHoliday(date(2025, 9, 8))).toBe(true);
    });

    it('cascades substitutes past the Christmas cluster without collisions', () => {
      const isHoliday = bgPublicHolidayPredicate(SOFIA);
      // 2028: 24 Dec is Sunday -> substitute lands on 27 Dec (25/26 occupied)
      expect(isHoliday(date(2028, 12, 24))).toBe(true);
      expect(isHoliday(date(2028, 12, 25))).toBe(true);
      expect(isHoliday(date(2028, 12, 26))).toBe(true);
      expect(isHoliday(date(2028, 12, 27))).toBe(true);
    });

    it('does NOT substitute the Easter cluster (excluded by law)', () => {
      const isHoliday = bgPublicHolidayPredicate(SOFIA);
      // 2026 Easter Sunday is Apr 12 (Sun); no extra Monday substitute beyond
      // the existing Easter Monday (Apr 13). Apr 14 stays an ordinary day.
      expect(isHoliday(date(2026, 4, 14))).toBe(false);
    });
  });
});
