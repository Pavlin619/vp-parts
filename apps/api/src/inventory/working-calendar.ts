/**
 * Timezone-safe shop calendar helpers. Every "now" the app sees is an absolute
 * instant (a `Date`), which is identical regardless of where the server runs
 * (e.g. eu-central-1). We NEVER read server-local fields (`getHours`,
 * `getDate`, ...). Instead we project instants into the shop's civil calendar
 * via `Intl.DateTimeFormat` with an explicit `timeZone`, do all reasoning on
 * those civil parts, and convert back to an instant only at the very end.
 */

import Holidays from 'date-holidays';

/** A civil (wall-clock) date in the shop timezone. `month` is 1-12. */
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

/** A civil (wall-clock) date and time in the shop timezone. */
export interface CivilDateTime extends CivilDate {
  hour: number;
  minute: number;
}

/** Opening hours for one weekday. `closeHour` is the exclusive boundary. */
export interface DailyHours {
  openHour: number;
  closeHour: number;
}

export interface ShopCalendarConfig {
  timeZone: string;
  /** Hours per weekday, indexed 0=Sunday .. 6=Saturday. A closed day is null. */
  weeklyHours: ReadonlyArray<DailyHours | null>;
  /** Returns true when the shop is closed for a public holiday on that date. */
  isHoliday: (date: CivilDate) => boolean;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Projects an absolute instant into shop-local civil parts (+ weekday). */
export function toShopCivil(
  instant: Date,
  timeZone: string,
): CivilDateTime & { weekday: number } {
  const parts = civilPartsFormatter(timeZone).formatToParts(instant);

  const lookup = partsLookup(parts);

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    weekday: WEEKDAY_INDEX[lookup.weekday],
  };
}

/** "YYYY-MM-DD" for a civil date. */
export function civilDateKey(date: CivilDate): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

/** Weekday (0=Sunday .. 6=Saturday) of a civil date. */
export function weekdayOf(date: CivilDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** Adds (or subtracts) calendar days to a civil date, timezone-safe. */
export function addCalendarDays(date: CivilDate, days: number): CivilDate {
  const carrier = new Date(
    Date.UTC(date.year, date.month - 1, date.day) + days * MILLIS_PER_DAY,
  );
  return {
    year: carrier.getUTCFullYear(),
    month: carrier.getUTCMonth() + 1,
    day: carrier.getUTCDate(),
  };
}

/** Opening hours for the given civil date, or null when the shop is closed. */
export function hoursFor(
  date: CivilDate,
  config: ShopCalendarConfig,
): DailyHours | null {
  if (config.isHoliday(date)) {
    return null;
  }
  return config.weeklyHours[weekdayOf(date)] ?? null;
}

/** True when the shop is open on the given civil date. */
export function isShopOpenOn(
  date: CivilDate,
  config: ShopCalendarConfig,
): boolean {
  return hoursFor(date, config) !== null;
}

/** First open day at or after the given civil date. */
export function nextOpenDayOnOrAfter(
  date: CivilDate,
  config: ShopCalendarConfig,
): CivilDate {
  let candidate = date;
  while (!isShopOpenOn(candidate, config)) {
    candidate = addCalendarDays(candidate, 1);
  }
  return candidate;
}

/**
 * Advances `count` working (shop-open) days forward. `count = 0` returns the
 * date unchanged (the caller guarantees it is already an open dispatch day).
 */
export function addWorkingDays(
  date: CivilDate,
  count: number,
  config: ShopCalendarConfig,
): CivilDate {
  let remaining = count;
  let candidate = date;

  while (remaining > 0) {
    candidate = addCalendarDays(candidate, 1);
    if (isShopOpenOn(candidate, config)) {
      remaining -= 1;
    }
  }

  return candidate;
}

/**
 * Converts a shop-local civil datetime back to the absolute instant it denotes.
 * The timezone offset is probed at the civil time (interpreted as UTC); this is
 * exact except inside a DST transition hour, which never overlaps shop hours.
 */
export function shopCivilToInstant(
  datetime: CivilDateTime,
  timeZone: string,
): Date {
  const civilAsUtc = Date.UTC(
    datetime.year,
    datetime.month - 1,
    datetime.day,
    datetime.hour,
    datetime.minute,
    0,
  );
  const offsetMillis = timeZoneOffsetMillis(timeZone, new Date(civilAsUtc));
  return new Date(civilAsUtc - offsetMillis);
}

/**
 * Builds a predicate for Bulgarian public holidays. The holiday dates (fixed
 * days + the movable Orthodox Easter cluster) come from the maintained
 * `date-holidays` library; we only layer on the Bulgarian Labour Code
 * weekend-substitution rule. Results are computed once per year and cached.
 */
export function bgPublicHolidayPredicate(
  timeZone: string,
): (date: CivilDate) => boolean {
  const engine = createBgHolidayEngine(timeZone);
  const cache = new Map<number, Set<string>>();

  return (date: CivilDate): boolean => {
    let holidays = cache.get(date.year);
    if (!holidays) {
      holidays = bgHolidayKeysForYear(engine, date.year);
      cache.set(date.year, holidays);
    }
    return holidays.has(civilDateKey(date));
  };
}

const MILLIS_PER_DAY = 86_400_000;

/**
 * Building an `Intl.DateTimeFormat` costs ~40 µs against ~3 µs to reuse one,
 * and an availability read formats several times per article — so the
 * formatters are built once per timezone and kept. Keyed by timezone rather
 * than held in a single slot: there is one shop timezone in practice, but a
 * second one must not silently answer with the first one's calendar.
 */
const civilPartsFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetProbeFormatters = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cached = cache.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone });
  cache.set(timeZone, formatter);

  return formatter;
}

function civilPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  return cachedFormatter(civilPartsFormatters, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
}

function offsetProbeFormatter(timeZone: string): Intl.DateTimeFormat {
  return cachedFormatter(offsetProbeFormatters, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function partsLookup(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }
  return lookup;
}

/** Milliseconds the timezone is ahead of UTC at the given instant. */
function timeZoneOffsetMillis(timeZone: string, instant: Date): number {
  const parts = offsetProbeFormatter(timeZone).formatToParts(instant);

  const lookup = partsLookup(parts);
  const wallClockAsUtc = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second),
  );

  return wallClockAsUtc - instant.getTime();
}

/**
 * Bulgarian official public holidays that shift when they fall on a weekend.
 * Expressed in `date-holidays` grammar (month-day). The Easter cluster is kept
 * separate because it is excluded from the weekend-substitution rule.
 */
const BG_SUBSTITUTABLE_RULES = [
  '01-01', // New Year
  '03-03', // Liberation Day
  '05-01', // Labour Day
  '05-06', // St George's Day / Army
  '05-24', // Education & Culture / Slavonic Alphabet
  '09-06', // Unification Day
  '09-22', // Independence Day
  '12-24', // Christmas Eve
  '12-25', // Christmas Day
  '12-26', // Second day of Christmas
] as const;

/** The movable Orthodox Easter cluster, computed by `date-holidays`. */
const BG_EASTER_RULES = [
  'orthodox -2', // Good Friday
  'orthodox -1', // Holy Saturday
  'orthodox', // Easter Sunday
  'orthodox 1', // Easter Monday
] as const;

function createBgHolidayEngine(timeZone: string): Holidays {
  const engine = new Holidays();
  engine.init('', { timezone: timeZone });

  for (const rule of [...BG_SUBSTITUTABLE_RULES, ...BG_EASTER_RULES]) {
    engine.setHoliday(rule, { name: rule, type: 'public' });
  }

  return engine;
}

function bgHolidayKeysForYear(engine: Holidays, year: number): Set<string> {
  const occupied = new Set<string>();
  const substitutable: CivilDate[] = [];

  for (const holiday of engine.getHolidays(year)) {
    const civil = parseHolidayDate(holiday.date);
    occupied.add(civilDateKey(civil));

    if (!holiday.rule.startsWith('orthodox')) {
      substitutable.push(civil);
    }
  }

  addBgSubstituteDays(substitutable, occupied);

  return occupied;
}

/**
 * Bulgarian Labour Code art. 154(2): when an official holiday (other than the
 * Easter cluster) falls on a Saturday or Sunday, the first following working
 * day becomes non-working. Consecutive weekend holidays cascade onto
 * consecutive working days. Mutates `occupied` in place.
 */
function addBgSubstituteDays(
  substitutable: CivilDate[],
  occupied: Set<string>,
): void {
  const ascending = [...substitutable].sort((left, right) =>
    civilDateKey(left).localeCompare(civilDateKey(right)),
  );

  for (const holiday of ascending) {
    if (!isWeekend(holiday)) {
      continue;
    }

    let candidate = addCalendarDays(holiday, 1);
    while (isWeekend(candidate) || occupied.has(civilDateKey(candidate))) {
      candidate = addCalendarDays(candidate, 1);
    }

    occupied.add(civilDateKey(candidate));
  }
}

function isWeekend(date: CivilDate): boolean {
  const weekday = weekdayOf(date);
  return weekday === 0 || weekday === 6;
}

function parseHolidayDate(value: string): CivilDate {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return { year, month, day };
}
