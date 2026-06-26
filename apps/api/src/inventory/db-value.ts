import { Prisma } from '../generated/prisma';

/**
 * The shape a numeric/currency column can take when read back via `$queryRaw`:
 * a JS number, a stringified decimal, a bigint, a Prisma.Decimal, or null.
 */
type RawNumeric = number | string | bigint | Prisma.Decimal | null;

/** Truncates a possibly-null DB numeric value to a safe integer (0 when null). */
export function toInteger(value: RawNumeric): number {
  if (value == null) return 0;
  return Math.trunc(Number(value));
}

/**
 * Truncates a DB numeric value to a safe integer, or returns `null` when the
 * value is missing or not a finite number. Used for quantity columns where the
 * distinction between "zero in stock" (a valid 0) and "unknown" (null) matters:
 * the caller treats `null` as a data anomaly and excludes the row.
 */
export function toIntegerOrNull(value: RawNumeric): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
}

/**
 * Converts a possibly-null decimal currency value to integer EUR cents (0 when
 * null). Centralised so every repository maps money the same way at the DB
 * boundary.
 */
export function toCents(value: RawNumeric): number {
  if (value == null) return 0;
  return Math.round(parseFloat(String(value)) * 100);
}
