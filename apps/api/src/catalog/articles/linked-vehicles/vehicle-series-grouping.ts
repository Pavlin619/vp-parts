import { LinkedVehicleSeriesDto } from '@vp-parts-shop/shared';
import { LinkedVehicleWithSeries } from '../../../tecdoc';

/**
 * The model series of one make, each holding the modifications under it.
 *
 * Grouping happens here rather than at TecDoc because the hydration response
 * already carries `modId` on every row — asking the service for the series
 * separately would be a second read of data we hold, and its answer could
 * disagree with the rows beneath it.
 *
 * Both levels are sorted by name: TecDoc documents no order for either, and a
 * make of a common part runs to dozens of series.
 */
export function groupVehiclesBySeries(
  rows: LinkedVehicleWithSeries[],
): LinkedVehicleSeriesDto[] {
  const seriesById = new Map<string, LinkedVehicleSeriesDto>();

  for (const row of rows) {
    const existing = seriesById.get(row.seriesId);

    if (existing) {
      existing.vehicles.push(row.vehicle);
      continue;
    }

    seriesById.set(row.seriesId, {
      seriesId: row.seriesId,
      manufacturerId: row.manufacturerId,
      name: row.seriesName,
      vehicles: [row.vehicle],
    });
  }

  const series = [...seriesById.values()];

  for (const entry of series) {
    entry.vehicles.sort(byName);
  }

  return series.sort(byName);
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}
