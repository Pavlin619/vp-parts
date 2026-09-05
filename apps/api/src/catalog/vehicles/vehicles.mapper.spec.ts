import {
  TecDocVehicleVariantRecord,
  collectFavouredManufacturerIds,
  collectManufacturerFacet,
  mapAssemblyGroups,
  mapModelSeries,
  mapVehicleVariants,
} from './vehicles.mapper';

function variant(
  overrides: Partial<TecDocVehicleVariantRecord> = {},
): TecDocVehicleVariantRecord {
  return {
    linkageTargetId: 10001,
    vehicleModelSeriesId: 2,
    description: 'Golf VII 2.0 TDI',
    beginYearMonth: '2012-05',
    endYearMonth: null,
    engines: [{ code: 'CRBC' }],
    kiloWattsFrom: 110,
    horsePowerFrom: 150,
    capacityLiters: 2,
    fuelType: 'Diesel',
    bodyStyle: 'Hatchback',
    ...overrides,
  };
}

describe('collectManufacturerFacet', () => {
  it('keeps the vehicle count the popular half is ranked by', () => {
    expect(
      collectManufacturerFacet({
        mfrFacets: {
          counts: [
            { id: 16, name: 'Volkswagen', count: 2333 },
            { id: 5, name: 'AUDI', count: 1994 },
          ],
        },
      }),
    ).toEqual([
      { id: 16, name: 'Volkswagen', vehicleCount: 2333 },
      { id: 5, name: 'AUDI', vehicleCount: 1994 },
    ]);
  });

  it('reads an omitted facet as no makes', () => {
    expect(collectManufacturerFacet({})).toEqual([]);
    expect(collectManufacturerFacet({ mfrFacets: {} })).toEqual([]);
  });
});

describe('collectFavouredManufacturerIds', () => {
  it('reads the ids out of the legacy array wrapper', () => {
    expect(
      collectFavouredManufacturerIds({
        data: { array: [{ manuId: 5 }, { manuId: 74 }] },
      }),
    ).toEqual(new Set([5, 74]));
  });

  it('reads an omitted collection as no favoured makes', () => {
    expect(collectFavouredManufacturerIds({})).toEqual(new Set());
    expect(collectFavouredManufacturerIds({ data: {} })).toEqual(new Set());
  });
});

describe('mapModelSeries', () => {
  // The facet answers a call already narrowed to one make, so it does not
  // repeat the make on each row — it is stamped on from the request.
  it('stamps the manufacturer the facet was narrowed to onto every series', () => {
    expect(
      mapModelSeries(
        {
          vehicleModelSeriesFacets: {
            counts: [
              { id: 2, name: 'Golf' },
              { id: 3, name: 'Passat' },
            ],
          },
        },
        16,
      ),
    ).toEqual([
      { id: '2', manufacturerId: '16', name: 'Golf' },
      { id: '3', manufacturerId: '16', name: 'Passat' },
    ]);
  });

  it('reads an omitted facet as no series', () => {
    expect(mapModelSeries({}, 16)).toEqual([]);
    expect(mapModelSeries({ vehicleModelSeriesFacets: {} }, 16)).toEqual([]);
  });
});

describe('mapVehicleVariants', () => {
  it('maps a fully catalogued variant', () => {
    expect(
      mapVehicleVariants({
        linkageTargets: [variant({ endYearMonth: '2020-12' })],
      }),
    ).toEqual([
      {
        vehicleId: '10001',
        seriesId: '2',
        name: 'Golf VII 2.0 TDI',
        yearFrom: 2012,
        yearTo: 2020,
        engine: 'CRBC',
        powerKw: 110,
        powerHp: 150,
        displacementLiters: 2,
        fuelType: 'Diesel',
        bodyType: 'Hatchback',
        imageUrl: null,
      },
    ]);
  });

  // A variant still in production has no end date at all, which is a real state
  // rather than missing data.
  it('leaves an open-ended production run without an end year', () => {
    const [row] = mapVehicleVariants({
      linkageTargets: [variant({ endYearMonth: null })],
    });

    expect(row.yearFrom).toBe(2012);
    expect(row.yearTo).toBeNull();
  });

  // TecDoc files 2,143 cc as 2.2 l to match the badge on the car, so its litres
  // are taken verbatim — `capacityCC` rides along on the same record and
  // dividing that down would read 2.1.
  it('takes the litres TecDoc filed rather than deriving them', () => {
    const [row] = mapVehicleVariants({
      linkageTargets: [variant({ capacityLiters: 2.2 })],
    });

    expect(row.displacementLiters).toBe(2.2);
  });

  // An electric variant has no displacement to report, and TecDoc omits the
  // field rather than sending a zero.
  it('reports no displacement for a variant that has none', () => {
    const [row] = mapVehicleVariants({
      linkageTargets: [variant({ capacityLiters: undefined, engines: [] })],
    });

    expect(row.displacementLiters).toBeNull();
    expect(row.engine).toBe('');
  });

  it('maps the vehicle photo from the 800px asset', () => {
    const [row] = mapVehicleVariants({
      linkageTargets: [
        variant({
          vehicleImages: [{ imageURL800: 'https://example.test/large.jpg' }],
        }),
      ],
    });

    expect(row.imageUrl).toBe('https://example.test/large.jpg');
  });

  // 12.6% of variants have no photo filed, so this is an ordinary outcome.
  it('reports no photo when TecDoc files none', () => {
    const [row] = mapVehicleVariants({ linkageTargets: [variant()] });

    expect(row.imageUrl).toBeNull();
  });

  it('reads an omitted collection as no variants', () => {
    expect(mapVehicleVariants({})).toEqual([]);
  });
});

describe('mapAssemblyGroups', () => {
  it('maps the node ids and the parent links the tree is rebuilt from', () => {
    expect(
      mapAssemblyGroups({
        assemblyGroupFacets: {
          counts: [
            {
              assemblyGroupNodeId: 100001,
              assemblyGroupName: 'Brakes',
              parentNodeId: null,
            },
            {
              assemblyGroupNodeId: 100002,
              assemblyGroupName: 'Discs',
              parentNodeId: 100001,
            },
          ],
        },
      }),
    ).toEqual([
      { id: '100001', name: 'Brakes', parentId: null },
      { id: '100002', name: 'Discs', parentId: '100001' },
    ]);
  });

  it('reads an omitted facet as no categories', () => {
    expect(mapAssemblyGroups({})).toEqual([]);
    expect(mapAssemblyGroups({ assemblyGroupFacets: {} })).toEqual([]);
  });
});
