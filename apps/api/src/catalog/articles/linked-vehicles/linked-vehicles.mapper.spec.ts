import {
  collectLinkedManufacturers,
  collectLinkedTargetIds,
  collectLinkedVehicles,
  mapLinkedVehicle,
} from './linked-vehicles.mapper';

function linkage(linkingTargetId: number, linked = true) {
  return {
    articleLinkId: linkingTargetId * 10,
    linked,
    linkingTargetId,
    linkingTargetType: 'P',
  };
}

describe('collectLinkedManufacturers', () => {
  it('maps the makes out of the response envelope', () => {
    expect(
      collectLinkedManufacturers({
        data: {
          array: [
            { manuId: 5, manuName: 'BMW' },
            { manuId: 16, manuName: 'VW' },
          ],
        },
      }),
    ).toEqual([
      { manufacturerId: '5', name: 'BMW' },
      { manufacturerId: '16', name: 'VW' },
    ]);
  });

  // A row missing either half addresses nothing and reads as a blank line, so
  // it is dropped rather than rendered as an unopenable make.
  it('drops a record with no id or no name', () => {
    expect(
      collectLinkedManufacturers({
        data: {
          array: [{ manuId: 5, manuName: 'BMW' }, { manuId: 16 }, {}],
        },
      }),
    ).toEqual([{ manufacturerId: '5', name: 'BMW' }]);
  });

  it('reads an omitted collection as no makes', () => {
    expect(collectLinkedManufacturers({})).toEqual([]);
    expect(collectLinkedManufacturers({ data: {} })).toEqual([]);
  });
});

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

describe('collectLinkedVehicles', () => {
  it('reads the vehicle records out of the response envelope', () => {
    expect(
      collectLinkedVehicles({ data: { array: [{ carId: 1 }, { carId: 2 }] } }),
    ).toEqual([{ carId: 1 }, { carId: 2 }]);
  });

  it('reads an omitted collection as no vehicles', () => {
    expect(collectLinkedVehicles({})).toEqual([]);
    expect(collectLinkedVehicles({ data: {} })).toEqual([]);
  });
});

describe('mapLinkedVehicle', () => {
  it('maps a fully catalogued modification with its model series', () => {
    expect(
      mapLinkedVehicle({
        carId: 10020,
        motorCodes: { array: [{ motorCode: 'N47 D20 C' }] },
        vehicleDetails: {
          manuId: 5,
          manuName: 'BMW',
          modId: 8506,
          modelName: '3 Series (E90)',
          typeName: '320d',
          fuelType: 'Diesel',
          powerKwFrom: 130,
          powerHpFrom: 177,
          yearOfConstrFrom: 200503,
          yearOfConstrTo: 201112,
        },
      }),
    ).toEqual({
      seriesId: '8506',
      seriesName: '3 Series (E90)',
      manufacturerId: '5',
      vehicle: {
        vehicleId: '10020',
        name: '320d',
        yearFrom: 2005,
        yearTo: 2011,
        powerKw: 130,
        powerHp: 177,
        fuelType: 'Diesel',
        engineCodes: ['N47 D20 C'],
      },
    });
  });

  // A model still in production has no end date at all, which is a real state
  // rather than missing data — the row must survive it.
  it('leaves an open-ended production run without an end year', () => {
    const row = mapLinkedVehicle({
      carId: 1,
      vehicleDetails: { yearOfConstrFrom: 201401 },
    });

    expect(row.vehicle.yearFrom).toBe(2014);
    expect(row.vehicle.yearTo).toBeNull();
  });

  // TecDoc omits what it has not catalogued, so a sparse row arrives with the
  // keys simply absent. It is still a vehicle the part fits.
  it('nulls every optional field TecDoc omits instead of dropping the row', () => {
    expect(mapLinkedVehicle({ carId: 42 })).toEqual({
      seriesId: '',
      seriesName: '',
      manufacturerId: '',
      vehicle: {
        vehicleId: '42',
        name: '',
        yearFrom: null,
        yearTo: null,
        powerKw: null,
        powerHp: null,
        fuelType: null,
        engineCodes: [],
      },
    });
  });

  // One modification genuinely carries several codes, and a mechanic checking
  // the one stamped on the block against a truncated list concludes the part
  // does not fit — so every code on file is kept.
  it('keeps every engine code on file', () => {
    const row = mapLinkedVehicle({
      carId: 1,
      motorCodes: {
        array: [{ motorCode: 'N47 D20 C' }, { motorCode: 'N47 D20 A' }],
      },
    });

    expect(row.vehicle.engineCodes).toEqual(['N47 D20 C', 'N47 D20 A']);
  });

  it('drops an engine entry with no code rather than listing a blank', () => {
    const row = mapLinkedVehicle({
      carId: 1,
      motorCodes: { array: [{ motorCode: 'N47 D20 C' }, {}] },
    });

    expect(row.vehicle.engineCodes).toEqual(['N47 D20 C']);
  });

  // The shape live TecDoc actually sends, which the mapper originally read as a
  // bare array: `.map` on the wrapper threw and took the whole section with it.
  it('reads engine codes out of the array wrapper TecDoc nests them in', () => {
    const row = mapLinkedVehicle({
      carId: 1,
      motorCodes: { array: [{ motorCode: 'ABM' }] },
    });

    expect(row.vehicle.engineCodes).toEqual(['ABM']);
  });

  // A vehicle with no engine codes on file arrives as an empty wrapper.
  it('reads an empty wrapper as no engine codes', () => {
    const row = mapLinkedVehicle({ carId: 1, motorCodes: {} });

    expect(row.vehicle.engineCodes).toEqual([]);
  });

  // These years arrive as YYYYMM integers here, unlike the YYYY-MM strings the
  // catalogue browse call answers with.
  it('takes the year out of a YYYYMM integer', () => {
    const row = mapLinkedVehicle({
      carId: 1,
      vehicleDetails: { yearOfConstrFrom: 201004 },
    });

    expect(row.vehicle.yearFrom).toBe(2010);
  });

  it('treats a value too short to hold a year as unknown rather than NaN', () => {
    const row = mapLinkedVehicle({
      carId: 1,
      vehicleDetails: { yearOfConstrFrom: 20 },
    });

    expect(row.vehicle.yearFrom).toBeNull();
  });
});
