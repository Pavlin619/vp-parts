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
    });
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
