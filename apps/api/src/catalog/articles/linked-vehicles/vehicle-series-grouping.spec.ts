import { LinkedVehicleWithSeries } from '../../../tecdoc';
import { groupVehiclesBySeries } from './vehicle-series-grouping';

function row(
  seriesId: string,
  seriesName: string,
  name: string,
): LinkedVehicleWithSeries {
  return {
    seriesId,
    seriesName,
    manufacturerId: '5',
    vehicle: {
      vehicleId: `${seriesId}-${name}`,
      name,
      yearFrom: null,
      yearTo: null,
      powerKw: null,
      powerHp: null,
      fuelType: null,
      engineCodes: [],
    },
  };
}

describe('groupVehiclesBySeries', () => {
  it('nests the vehicles of one series under it', () => {
    const series = groupVehiclesBySeries([
      row('1', '3 Series', '320d'),
      row('1', '3 Series', '318d'),
      row('2', '5 Series', '520d'),
    ]);

    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ seriesId: '1', name: '3 Series' });
    expect(series[0].vehicles.map((vehicle) => vehicle.name)).toEqual([
      '318d',
      '320d',
    ]);
  });

  // TecDoc documents no order for either level, and a common part runs to
  // dozens of series — an arbitrary order is unreadable at that size.
  it('sorts series and their vehicles by name', () => {
    const series = groupVehiclesBySeries([
      row('2', '5 Series', '530d'),
      row('1', '3 Series', '320d'),
      row('2', '5 Series', '520d'),
    ]);

    expect(series.map((entry) => entry.name)).toEqual(['3 Series', '5 Series']);
    expect(series[1].vehicles.map((vehicle) => vehicle.name)).toEqual([
      '520d',
      '530d',
    ]);
  });

  it('answers no series for no vehicles', () => {
    expect(groupVehiclesBySeries([])).toEqual([]);
  });
});
