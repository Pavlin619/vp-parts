import { TecDocTransport } from '../../tecdoc';
import { VehiclesTecDoc } from './vehicles.tecdoc';

describe('VehiclesTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: VehiclesTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new VehiclesTecDoc({ call } as unknown as TecDocTransport);
  });

  it('getManufacturerFacet asks getLinkageTargets for the make facet alone', async () => {
    call.mockResolvedValueOnce({
      mfrFacets: { counts: [{ id: 16, name: 'Volkswagen', count: 2333 }] },
    });

    const result = await tecdoc.getManufacturerFacet();

    expect(call).toHaveBeenCalledWith(
      'getLinkageTargets',
      expect.objectContaining({ perPage: 0, includeMfrFacets: true }),
    );
    expect(result).toEqual([
      { id: 16, name: 'Volkswagen', vehicleCount: 2333 },
    ]);
  });

  // TecDoc has no popularity signal on the facet, so this is a second call to a
  // legacy function. `linkingTargetType` is required, and its letters are the
  // legacy set rather than the facet call's — 'P' is passenger car alone here.
  it('getPopularManufacturerIds reads the favoured list from getManufacturers2', async () => {
    call.mockResolvedValueOnce({ data: { array: [{ manuId: 16 }] } });

    const result = await tecdoc.getPopularManufacturerIds();

    expect(call).toHaveBeenCalledWith(
      'getManufacturers2',
      expect.objectContaining({
        linkingTargetType: 'P',
        favouredList: 1,
      }),
    );
    expect(result).toEqual(new Set([16]));
  });

  it('getModelSeries passes the manufacturerId as a number and maps the facets', async () => {
    call.mockResolvedValueOnce({
      vehicleModelSeriesFacets: {
        counts: [
          { id: 2, name: 'Golf', beginYearMonth: 201208, endYearMonth: 202007 },
        ],
      },
    });

    const result = await tecdoc.getModelSeries(16);

    expect(call).toHaveBeenCalledWith(
      'getLinkageTargets',
      expect.objectContaining({ mfrIds: 16 }),
    );
    expect(result).toEqual([
      {
        id: '2',
        manufacturerId: '16',
        name: 'Golf',
        yearFrom: 2012,
        yearTo: 2020,
      },
    ]);
  });

  it('getVehicleVariants reads the targets of one model series', async () => {
    call.mockResolvedValueOnce({ status: 200 });

    await tecdoc.getVehicleVariants(2);

    expect(call).toHaveBeenCalledWith(
      'getLinkageTargets',
      expect.objectContaining({ vehicleModelSeriesIds: 2, perPage: 100 }),
    );
  });

  // 'VL' is passenger cars and LCVs, which is what the shop sells parts for.
  // It has to be the same on all three steps: a make list narrower than the
  // series list behind it strands a visitor on a make whose series are all
  // bikes. KTM is the live case — 2 X-Bow series here against 40 under 'P'.
  it.each([
    ['getManufacturerFacet', () => tecdoc.getManufacturerFacet()],
    ['getModelSeries', () => tecdoc.getModelSeries(2760)],
    ['getVehicleVariants', () => tecdoc.getVehicleVariants(2)],
  ])(
    '%s excludes motorcycles from the selectable vehicles',
    async (_name, load) => {
      call.mockResolvedValue({ status: 200 });

      await load();

      expect(call).toHaveBeenCalledWith(
        'getLinkageTargets',
        expect.objectContaining({ linkageTargetType: 'VL' }),
      );
    },
  );

  it('getAssemblyGroupTree maps a node with its article count and order', async () => {
    call.mockResolvedValueOnce({
      assemblyGroupFacets: {
        counts: [
          {
            assemblyGroupNodeId: 100001,
            assemblyGroupName: 'Brakes',
            parentNodeId: null,
            children: 17,
            count: 3940,
            sortNo: 13,
          },
        ],
      },
    });

    const result = await tecdoc.getAssemblyGroupTree(10001);

    expect(call).toHaveBeenCalledWith(
      'getArticles',
      expect.objectContaining({ linkageTargetId: 10001 }),
    );
    expect(result).toEqual([
      {
        id: '100001',
        name: 'Brakes',
        parentId: null,
        articleCount: 3940,
        sortNo: 13,
      },
    ]);
  });

  /**
   * The tree is four levels deep and every one of them is a category a visitor
   * can reach — an A3 is 35 roots over 257 / 313 / 168 nodes beneath. A depth
   * would withhold most of them, and the schema makes it easy to do by
   * accident: `maxDepth` counts levels rather than edges and `0` empties the
   * facet outright.
   */
  it('getAssemblyGroupTree asks for no depth, so every level comes back', async () => {
    call.mockResolvedValue({ status: 200 });

    await tecdoc.getAssemblyGroupTree(10001);

    const [, payload] = call.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.assemblyGroupFacetOptions).not.toHaveProperty('maxDepth');
  });

  // Measured a no-op under a vehicle linkage: naming no tree, 'P', 'PU' and
  // includeCompleteTree all answer the identical 773 nodes / 110,096 bytes,
  // because such a facet is anchored at the vehicle either way.
  it('getAssemblyGroupTree does not ask for the complete tree', async () => {
    call.mockResolvedValue({ status: 200 });

    await tecdoc.getAssemblyGroupTree(10001);

    const [, payload] = call.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.assemblyGroupFacetOptions).not.toHaveProperty(
      'includeCompleteTree',
    );
  });

  // Not 'VL': `getArticles` refuses a concatenated code outright, and pairs the
  // type against the id — a car id under 'V' and a van id under 'L' are both
  // rejected, so 'P' is the only single code that accepts either.
  it('getAssemblyGroupTree keeps the wide code getArticles requires', async () => {
    call.mockResolvedValue({ status: 200 });

    await tecdoc.getAssemblyGroupTree(10001);

    expect(call).toHaveBeenCalledWith(
      'getArticles',
      expect.objectContaining({ linkageTargetType: 'P' }),
    );
  });

  // TecDoc signals "nothing matched" by omitting the collection, not by sending
  // an empty one, and it still answers status 200 — an unknown-but-well-formed
  // id looks exactly like a real one with no data. Each mapper handles this and
  // is tested for it; this is the guard that every read goes through one.
  describe('when TecDoc omits the collection because nothing matched', () => {
    it.each([
      ['getManufacturerFacet', () => tecdoc.getManufacturerFacet()],
      ['getModelSeries', () => tecdoc.getModelSeries(99999999)],
      ['getVehicleVariants', () => tecdoc.getVehicleVariants(99999999)],
      ['getAssemblyGroupTree', () => tecdoc.getAssemblyGroupTree(99999999)],
    ])('%s returns an empty list', async (_name, load) => {
      call.mockResolvedValue({ status: 200 });

      await expect(load()).resolves.toEqual([]);
    });

    it('getPopularManufacturerIds returns an empty set', async () => {
      call.mockResolvedValue({ status: 200 });

      await expect(tecdoc.getPopularManufacturerIds()).resolves.toEqual(
        new Set(),
      );
    });
  });
});
