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
              {
                id: 2,
                name: 'Golf',
                beginYearMonth: 201208,
                endYearMonth: 202007,
              },
              {
                id: 3,
                name: 'Passat',
                beginYearMonth: 201411,
                endYearMonth: 202305,
              },
            ],
          },
        },
        16,
      ),
    ).toEqual([
      {
        id: '2',
        manufacturerId: '16',
        name: 'Golf',
        yearFrom: 2012,
        yearTo: 2020,
      },
      {
        id: '3',
        manufacturerId: '16',
        name: 'Passat',
        yearFrom: 2014,
        yearTo: 2023,
      },
    ]);
  });

  // The facet spells the year-month as a `YYYYMM` integer, while the linkage
  // target records the same function can return use a `YYYY-MM` string.
  it('reads the facet year-month as a packed integer', () => {
    const [series] = mapModelSeries(
      {
        vehicleModelSeriesFacets: {
          counts: [
            { id: 1, name: '80 B4 Седан (8C2)', beginYearMonth: 199109 },
          ],
        },
      },
      5,
    );

    expect(series.yearFrom).toBe(1991);
  });

  // 27% of series are still built, and TecDoc omits the end rather than
  // sending a sentinel.
  it('leaves a series still in production without an end year', () => {
    const [series] = mapModelSeries(
      {
        vehicleModelSeriesFacets: {
          counts: [{ id: 4, name: 'Polo', beginYearMonth: 201706 }],
        },
      },
      16,
    );

    expect(series.yearTo).toBeNull();
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
        engineCodes: ['CRBC'],
        powerKw: 110,
        powerHp: 150,
        displacementLiters: 2,
        fuelType: 'Diesel',
        bodyType: 'Hatchback',
        imageUrl: null,
        kbaNumbers: [],
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
    expect(row.engineCodes).toEqual([]);
  });

  // A third of variants are built with more than one engine, and the visitor is
  // matching this against a code stamped on their own block — so the whole list
  // is kept, exactly as the type-approval numbers below are.
  it('keeps every engine code filed for a variant', () => {
    const [row] = mapVehicleVariants({
      linkageTargets: [
        variant({ engines: [{ code: 'OM 642.852' }, { code: 'OM 642.850' }] }),
      ],
    });

    expect(row.engineCodes).toEqual(['OM 642.852', 'OM 642.850']);
  });

  // Present on every variant measured, but optional in the XSD — and TecDoc
  // omits a collection rather than sending it empty.
  it('reads an omitted engine collection as no codes filed', () => {
    const [row] = mapVehicleVariants({
      linkageTargets: [variant({ engines: undefined })],
    });

    expect(row.engineCodes).toEqual([]);
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

  // A variant sold under two type approvals files one number per approval, so
  // the whole list is kept rather than the first entry.
  it('keeps every type-approval number filed for a variant', () => {
    const [row] = mapVehicleVariants({
      linkageTargets: [variant({ kbaNumbers: ['0603BLP', '0603BOF'] })],
    });

    expect(row.kbaNumbers).toEqual(['0603BLP', '0603BOF']);
  });

  // 4% of measured variants have none, and TecDoc omits the collection rather
  // than sending it empty.
  it('reads an omitted type-approval collection as none filed', () => {
    const [row] = mapVehicleVariants({ linkageTargets: [variant()] });

    expect(row.kbaNumbers).toEqual([]);
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
