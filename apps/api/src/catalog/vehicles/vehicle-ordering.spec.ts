import { ModelSeriesDto, VehicleVariantDto } from '@vp-parts-shop/shared';
import { orderModelSeries, orderVehicleVariants } from './vehicle-ordering';

function series(id: string, name: string, yearFrom = 2000): ModelSeriesDto {
  return { id, manufacturerId: '5', name, yearFrom, yearTo: null };
}

function variant(
  vehicleId: string,
  name: string,
  yearFrom = 2000,
): VehicleVariantDto {
  return {
    vehicleId,
    seriesId: '11851',
    name,
    engineCodes: ['OM651'],
    powerKw: 100,
    powerHp: 136,
    displacementLiters: 2,
    yearFrom,
    yearTo: null,
    fuelType: 'Diesel',
    bodyType: 'Saloon',
    imageUrl: null,
    kbaNumbers: [],
  };
}

function namesOf(list: Array<{ name: string }>) {
  return list.map((entry) => entry.name);
}

describe('orderModelSeries', () => {
  // The facet arrives in ascending id, which is neither the alphabet nor
  // chronological — this is the AUDI head of the list as TecDoc sends it.
  it('sorts the arrival order of a real make into the alphabet', () => {
    const arrival = [
      series('1', '80 B4 Седан (8C2)', 1991),
      series('6', '80 B4 Avant (8C5)', 1991),
      series('10', '100 C2 Седан (431, 433, 434)', 1976),
      series('13', '100 C3 Седан (443, 444)', 1982),
      series('14', '80 B1 Седан (80, 82)', 1972),
    ];

    expect(namesOf(orderModelSeries(arrival))).toEqual([
      '80 B1 Седан (80, 82)',
      '80 B4 Седан (8C2)',
      '80 B4 Avant (8C5)',
      '100 C2 Седан (431, 433, 434)',
      '100 C3 Седан (443, 444)',
    ]);
  });

  // Bulgarian collation puts Cyrillic ahead of Latin, and TecDoc localises only
  // some body words — 'Седан' and 'купе' but not 'Avant' — so the two scripts
  // meet inside one model range. Pinned because it reads as a bug otherwise.
  it('groups the localised bodies of one range ahead of the Latin ones', () => {
    const ordered = orderModelSeries([
      series('a', 'A4 Avant (8W5)'),
      series('b', 'A4 Седан (8W2)'),
      series('c', 'A4 Allroad (8WH)'),
    ]);

    expect(namesOf(ordered)).toEqual([
      'A4 Седан (8W2)',
      'A4 Allroad (8WH)',
      'A4 Avant (8W5)',
    ]);
  });

  // Lexically '100' precedes '80', which reads as a broken list on every make
  // that names its ranges numerically.
  it('reads a leading number as a number, not as digits', () => {
    const ordered = orderModelSeries([
      series('a', '100 C1'),
      series('b', '80 B1'),
      series('c', '200 Седан'),
      series('d', '90 B2'),
    ]);

    expect(namesOf(ordered)).toEqual(['80 B1', '90 B2', '100 C1', '200 Седан']);
  });

  it('keeps a lettered range in the alphabet', () => {
    const ordered = orderModelSeries([
      series('a', 'Q6 E-TRON (GEN)'),
      series('b', 'A3 (8P)'),
      series('c', 'A4 (8W2, 8WC)'),
      series('d', 'A1 (8X1)'),
    ]);

    expect(namesOf(ordered)).toEqual([
      'A1 (8X1)',
      'A3 (8P)',
      'A4 (8W2, 8WC)',
      'Q6 E-TRON (GEN)',
    ]);
  });

  it('breaks a tie on the production start so two reads cannot disagree', () => {
    const ordered = orderModelSeries([
      series('20', 'C-CLASS', 2014),
      series('19', 'C-CLASS', 2007),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual(['19', '20']);
  });

  it('leaves the caller its own array', () => {
    const arrival = [series('1', 'B'), series('2', 'A')];

    orderModelSeries(arrival);

    expect(namesOf(arrival)).toEqual(['B', 'A']);
  });

  it('orders an empty list', () => {
    expect(orderModelSeries([])).toEqual([]);
  });
});

describe('orderVehicleVariants', () => {
  it('sorts engine names into a ladder', () => {
    const ordered = orderVehicleVariants([
      variant('100903', 'C 250 (205.045)'),
      variant('100551', 'C 200 (205.042)'),
      variant('112350', 'C 160 (205.044)'),
      variant('100750', 'C 180 (205.040, 205.140)'),
    ]);

    expect(namesOf(ordered)).toEqual([
      'C 160 (205.044)',
      'C 180 (205.040, 205.140)',
      'C 200 (205.042)',
      'C 250 (205.045)',
    ]);
  });

  // TecDoc files two of these under the W205 — 270 kW from 2016 and 287 kW
  // from 2018 — so the name alone cannot decide the order.
  it('breaks a duplicate engine name on the production start', () => {
    const ordered = orderVehicleVariants([
      variant('131370', 'AMG C 43 4-matic (205.064)', 2018),
      variant('119516', 'AMG C 43 4-matic (205.064)', 2016),
    ]);

    expect(ordered.map((entry) => entry.vehicleId)).toEqual([
      '119516',
      '131370',
    ]);
  });

  it('falls back to the vehicle id when name and year both tie', () => {
    const ordered = orderVehicleVariants([
      variant('222', 'C 200', 2014),
      variant('111', 'C 200', 2014),
    ]);

    expect(ordered.map((entry) => entry.vehicleId)).toEqual(['111', '222']);
  });

  it('leaves the caller its own array', () => {
    const arrival = [variant('2', 'C 250'), variant('1', 'C 180')];

    orderVehicleVariants(arrival);

    expect(namesOf(arrival)).toEqual(['C 250', 'C 180']);
  });
});
