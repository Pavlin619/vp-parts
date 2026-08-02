import {
  collectLinkedTargetIds,
  mapLinkedVehicle,
} from './linked-vehicle-mapper';

function linkage(linkingTargetId: number, linked = true) {
  return {
    articleLinkId: linkingTargetId * 10,
    linked,
    linkingTargetId,
    linkingTargetType: 'P',
  };
}

describe('collectLinkedTargetIds', () => {
  it('reads the ids out of the doubly-nested response envelope', () => {
    expect(
      collectLinkedTargetIds({
        data: {
          array: [
            { articleLinkages: { array: [linkage(33251), linkage(26581)] } },
          ],
        },
      }),
    ).toEqual([33251, 26581]);
  });

  // A part can be linked to one vehicle through several article links; the
  // envelope lists each of them, and each carries its own target id.
  it('flattens the linkages of every record in the envelope', () => {
    expect(
      collectLinkedTargetIds({
        data: {
          array: [
            { articleLinkages: { array: [linkage(1)] } },
            { articleLinkages: { array: [linkage(2)] } },
          ],
        },
      }),
    ).toEqual([1, 2]);
  });

  // `linked: false` is TecDoc answering that the article does NOT fit — the one
  // case where a returned row must not become a listed vehicle.
  it('drops a target the article is explicitly not linked to', () => {
    expect(
      collectLinkedTargetIds({
        data: {
          array: [
            { articleLinkages: { array: [linkage(1), linkage(2, false)] } },
          ],
        },
      }),
    ).toEqual([1]);
  });

  // An article with no linkages comes back as a plain status-200 with the
  // collection simply absent, at either level of the envelope.
  it('reads an omitted collection as no linkages', () => {
    expect(collectLinkedTargetIds({})).toEqual([]);
    expect(collectLinkedTargetIds({ data: {} })).toEqual([]);
    expect(collectLinkedTargetIds({ data: { array: [{}] } })).toEqual([]);
  });
});

describe('mapLinkedVehicle', () => {
  it('maps a fully catalogued modification', () => {
    expect(
      mapLinkedVehicle({
        linkageTargetId: 10020,
        mfrName: 'BMW',
        vehicleModelSeriesName: '3 Series (E90)',
        description: '320d',
        beginYearMonth: '2005-03',
        endYearMonth: '2011-12',
        kiloWattsFrom: 130,
        horsePowerFrom: 177,
        fuelType: 'Diesel',
        engines: [{ code: 'N47 D20 C' }],
      }),
    ).toEqual({
      vehicleId: '10020',
      manufacturerName: 'BMW',
      modelSeriesName: '3 Series (E90)',
      name: '320d',
      yearFrom: 2005,
      yearTo: 2011,
      powerKw: 130,
      powerHp: 177,
      fuelType: 'Diesel',
      engineCode: 'N47 D20 C',
    });
  });

  // A model still in production has no end date at all, which is a real state
  // rather than missing data — the row must survive it.
  it('leaves an open-ended production run without an end year', () => {
    const vehicle = mapLinkedVehicle({
      linkageTargetId: 1,
      beginYearMonth: '2014-01',
      endYearMonth: null,
    });

    expect(vehicle.yearFrom).toBe(2014);
    expect(vehicle.yearTo).toBeNull();
  });

  // TecDoc omits what it has not catalogued, so a sparse row arrives with the
  // keys simply absent. It is still a vehicle the part fits.
  it('nulls every optional field TecDoc omits instead of dropping the row', () => {
    expect(mapLinkedVehicle({ linkageTargetId: 42 })).toEqual({
      vehicleId: '42',
      manufacturerName: '',
      modelSeriesName: '',
      name: '',
      yearFrom: null,
      yearTo: null,
      powerKw: null,
      powerHp: null,
      fuelType: null,
      engineCode: null,
    });
  });

  it('takes the engine code from the first engine on file', () => {
    const vehicle = mapLinkedVehicle({
      linkageTargetId: 1,
      engines: [{ code: 'N47 D20 C' }, { code: 'N47 D20 A' }],
    });

    expect(vehicle.engineCode).toBe('N47 D20 C');
  });

  it('treats an unparseable date as unknown rather than NaN', () => {
    const vehicle = mapLinkedVehicle({
      linkageTargetId: 1,
      beginYearMonth: 'n/a',
    });

    expect(vehicle.yearFrom).toBeNull();
  });
});
