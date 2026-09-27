import type { DeliveryOfficeHoursDto } from '@vp-parts-shop/shared';

const CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Sofia',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Econt sends opening hours as instants on an arbitrary day; only the Bulgarian clock time matters.
 * A closed day comes as an empty window (opens and closes at the same instant), not as null.
 */
export function officeHoursOf(
  opensAt: number | null,
  closesAt: number | null,
): DeliveryOfficeHoursDto | null {
  if (opensAt === null || closesAt === null || opensAt === closesAt) {
    return null;
  }

  return { opensAt: CLOCK.format(opensAt), closesAt: CLOCK.format(closesAt) };
}
