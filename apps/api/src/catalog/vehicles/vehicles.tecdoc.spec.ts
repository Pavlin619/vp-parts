import { TecDocTransport } from '../../tecdoc';
import { VehiclesTecDoc } from './vehicles.tecdoc';

describe('VehiclesTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: VehiclesTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new VehiclesTecDoc({ call } as unknown as TecDocTransport);
  });

  it('getManufacturers maps mfrFacets via getLinkageTargets', async () => {
    call.mockResolvedValueOnce({
      mfrFacets: { counts: [{ id: 16, name: 'Volkswagen' }] },
    });

    const result = await tecdoc.getManufacturers();

    expect(call).toHaveBeenCalledWith(
      'getLinkageTargets',
      expect.objectContaining({
        linkageTargetType: 'P',
        includeMfrFacets: true,
      }),
    );
    expect(result).toEqual([{ id: '16', name: 'Volkswagen' }]);
  });

  it('getModelSeries passes the manufacturerId as a number and maps the facets', async () => {
    call.mockResolvedValueOnce({
      vehicleModelSeriesFacets: { counts: [{ id: 2, name: 'Golf' }] },
    });

    const result = await tecdoc.getModelSeries(16);

    expect(call).toHaveBeenCalledWith(
      'getLinkageTargets',
      expect.objectContaining({ mfrIds: 16 }),
    );
    expect(result).toEqual([{ id: '2', manufacturerId: '16', name: 'Golf' }]);
  });

  it('getVehicleTypes maps linkage targets including a null end year', async () => {
    call.mockResolvedValueOnce({
      linkageTargets: [
        {
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
        },
      ],
    });

    const result = await tecdoc.getVehicleTypes(2);

    expect(result[0]).toMatchObject({
      vehicleId: '10001',
      seriesId: '2',
      yearFrom: 2012,
      yearTo: null,
      engine: 'CRBC',
      powerKw: 110,
      powerHp: 150,
      displacementLiters: 2,
    });
  });

  // TecDoc files 2,143 cc as 2.2 l to match the badge on the car, so the litres
  // it sends are not `capacityCC` divided down — that would read 2.1.
  it('getVehicleTypes takes the litres TecDoc filed rather than the cc', async () => {
    call.mockResolvedValueOnce({
      linkageTargets: [
        {
          linkageTargetId: 10002,
          vehicleModelSeriesId: 3,
          description: 'E 220 CDI',
          beginYearMonth: '2009-01',
          endYearMonth: '2016-12',
          engines: [{ code: 'OM651' }],
          kiloWattsFrom: 125,
          horsePowerFrom: 170,
          capacityCC: 2143,
          capacityLiters: 2.2,
          fuelType: 'Diesel',
          bodyStyle: 'Saloon',
        },
      ],
    });

    const result = await tecdoc.getVehicleTypes(3);

    expect(result[0].displacementLiters).toBe(2.2);
  });

  it('getVehicleTypes maps the vehicle photo from the 800px asset', async () => {
    call.mockResolvedValueOnce({
      linkageTargets: [
        {
          linkageTargetId: 10004,
          vehicleModelSeriesId: 2,
          description: '2.0 TDI',
          beginYearMonth: '2012-05',
          endYearMonth: null,
          engines: [{ code: 'CRBC' }],
          kiloWattsFrom: 110,
          horsePowerFrom: 150,
          vehicleImages: [
            {
              imageURL200: 'https://example.test/small.jpg',
              imageURL800: 'https://example.test/large.jpg',
            },
          ],
          fuelType: 'Diesel',
          bodyStyle: 'Hatchback',
        },
      ],
    });

    const result = await tecdoc.getVehicleTypes(2);

    expect(result[0].imageUrl).toBe('https://example.test/large.jpg');
  });

  // 12.6% of variants have no photo filed, so this is an ordinary outcome.
  it('getVehicleTypes reports no photo when TecDoc files none', async () => {
    call.mockResolvedValueOnce({
      linkageTargets: [
        {
          linkageTargetId: 10005,
          vehicleModelSeriesId: 2,
          description: '1.6 TDI',
          beginYearMonth: '2012-05',
          endYearMonth: null,
          engines: [{ code: 'CLHA' }],
          kiloWattsFrom: 77,
          horsePowerFrom: 105,
          fuelType: 'Diesel',
          bodyStyle: 'Hatchback',
        },
      ],
    });

    const result = await tecdoc.getVehicleTypes(2);

    expect(result[0].imageUrl).toBeNull();
  });

  // An electric variant has no displacement to report, and TecDoc omits the
  // field rather than sending a zero.
  it('getVehicleTypes reports no displacement for a variant that has none', async () => {
    call.mockResolvedValueOnce({
      linkageTargets: [
        {
          linkageTargetId: 10003,
          vehicleModelSeriesId: 2,
          description: 'e-Golf',
          beginYearMonth: '2014-03',
          endYearMonth: null,
          engines: [],
          kiloWattsFrom: 100,
          horsePowerFrom: 136,
          fuelType: 'Electric',
          bodyStyle: 'Hatchback',
        },
      ],
    });

    const result = await tecdoc.getVehicleTypes(2);

    expect(result[0].displacementLiters).toBeNull();
  });

  it('getAssemblyGroupTree requests the complete tree and maps parent ids', async () => {
    call.mockResolvedValueOnce({
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
    });

    const result = await tecdoc.getAssemblyGroupTree(10001);

    expect(call).toHaveBeenCalledWith(
      'getArticles',
      expect.objectContaining({
        linkageTargetId: 10001,
        assemblyGroupFacetOptions: expect.objectContaining({
          includeCompleteTree: true,
        }),
      }),
    );
    expect(result).toEqual([
      { id: '100001', name: 'Brakes', parentId: null },
      { id: '100002', name: 'Discs', parentId: '100001' },
    ]);
  });

  // TecDoc signals "nothing matched" by omitting the collection, not by sending
  // an empty one, and it still answers status 200 — an unknown-but-well-formed
  // id looks exactly like a real one with no data. Dereferencing the missing key
  // turned that ordinary outcome into a 500.
  describe('when TecDoc omits the collection because nothing matched', () => {
    it.each([
      ['getManufacturers', () => tecdoc.getManufacturers()],
      ['getModelSeries', () => tecdoc.getModelSeries(99999999)],
      ['getVehicleTypes', () => tecdoc.getVehicleTypes(99999999)],
      ['getAssemblyGroupTree', () => tecdoc.getAssemblyGroupTree(99999999)],
    ])('%s returns an empty list', async (_name, load) => {
      call.mockResolvedValueOnce({ status: 200 });

      await expect(load()).resolves.toEqual([]);
    });
  });
});
