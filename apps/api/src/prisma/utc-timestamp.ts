import { Prisma } from '../generated/prisma';

/**
 * For a raw query. The columns hold UTC wall time, as Prisma writes them, while
 * a bound Date arrives as a timestamptz that Postgres would compare in the
 * session's zone.
 */
export function utcTimestamp(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant}::timestamptz AT TIME ZONE 'UTC')`;
}
