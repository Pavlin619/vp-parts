import type { WarehouseAvailabilityDto } from './dto/inventory.dto';

/**
 * How fast a warehouse can fulfil, as a customer-facing speed band.
 *
 * It decides two things that have to agree: the colour of the availability dot
 * the web renders (green → blue → yellow → orange as the promise slows) and the
 * order the API lists parts in. Stock on our own shelf has to sort above stock a
 * supplier will ship if we order before the cut-off, and it cannot if the two
 * sides derive the band separately — both promises are nominally "today", so
 * `deliveryWorkDays` alone reads them as equal.
 */
export type DeliveryBand = 'within-hour' | 'today' | 'day1' | 'day2' | 'day3';

/**
 * Derives the speed band from the warehouse's pickup projection. The central
 * warehouse is our own in-stock stock — always the fastest band, even after the
 * same-day cut-off rolls its pickup from a within-the-hour clock promise to a
 * dated one. A within-the-hour promise is likewise the fastest band; otherwise
 * the nominal working-day term (0 = today, then 1/2/3) selects the band, clamped
 * so anything slower than three days reads as the slowest one.
 */
export function deliveryBand(
  warehouse: WarehouseAvailabilityDto,
): DeliveryBand {
  if (
    warehouse.warehouseId === 'CENTRAL' ||
    warehouse.pickup.granularity === 'HOUR'
  ) {
    return 'within-hour';
  }

  if (warehouse.deliveryWorkDays <= 0) {
    return 'today';
  }
  if (warehouse.deliveryWorkDays === 1) {
    return 'day1';
  }
  if (warehouse.deliveryWorkDays === 2) {
    return 'day2';
  }

  return 'day3';
}

const BANDS_FASTEST_FIRST: readonly DeliveryBand[] = [
  'within-hour',
  'today',
  'day1',
  'day2',
  'day3',
];

/** A sortable position for a band, fastest first. */
export function deliveryBandRank(band: DeliveryBand): number {
  return BANDS_FASTEST_FIRST.indexOf(band);
}
