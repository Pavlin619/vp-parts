import { RedisCache } from '../../../redis';
import { LinkedVehiclesService } from './linked-vehicles.service';
import { LinkedVehiclesTecDoc } from './linked-vehicles.tecdoc';

const BOSCH = 30;

function hydrated(carId: number, seriesId: string, seriesName: string) {
  return {
    seriesId,
    seriesName,
    manufacturerId: '5',
    vehicle: {
      vehicleId: String(carId),
      name: `320d ${carId}`,
      yearFrom: null,
      yearTo: null,
      powerKw: null,
      powerHp: null,
      fuelType: null,
      engineCodes: [],
    },
  };
}

describe('LinkedVehiclesService', () => {
  let tecdoc: {
    getLegacyArticleIds: jest.Mock;
    getLinkedManufacturers: jest.Mock;
    getLinkedTargetIds: jest.Mock;
    getVehiclesByIds: jest.Mock;
  };
  let cache: {
    cachedArray: jest.Mock;
    readMemos: jest.Mock;
    writeMemos: jest.Mock;
  };
  let service: LinkedVehiclesService;

  beforeEach(() => {
    tecdoc = {
      getLegacyArticleIds: jest.fn().mockResolvedValue([]),
      getLinkedManufacturers: jest.fn().mockResolvedValue([]),
      getLinkedTargetIds: jest.fn().mockResolvedValue([]),
      getVehiclesByIds: jest.fn().mockResolvedValue([]),
    };
    cache = {
      cachedArray: jest.fn(
        (_key: string, _hit: number, _miss: number, loader: () => unknown) =>
          loader(),
      ),
      // Nothing memoised by default, so every test exercises the full
      // hydration read unless it says otherwise.
      readMemos: jest.fn((keys: string[]) =>
        Promise.resolve(keys.map(() => undefined)),
      ),
      writeMemos: jest.fn().mockResolvedValue(undefined),
    };

    service = new LinkedVehiclesService(
      tecdoc as unknown as LinkedVehiclesTecDoc,
      cache as unknown as RedisCache,
    );
  });

  // TecDoc keys linkages by `legacyArticleId`, not by the number a customer
  // reads off a part, so both reads start from the same extra lookup — which is
  // memoised on its own key, since the mapping only moves when TecDoc ships a
  // data release.
  it('memoises the article-number lookup by brand and number', async () => {
    await service.getManufacturers(BOSCH, 'OF-OC115');

    expect(tecdoc.getLegacyArticleIds).toHaveBeenCalledWith(BOSCH, 'OF-OC115');
    expect(cache.cachedArray).toHaveBeenCalledWith(
      'tecdoc:article-legacy-ids:30:OF-OC115',
      24 * 60 * 60,
      60 * 60,
      expect.any(Function),
    );
  });

  // A part TecDoc holds but files no role for has nothing to ask about.
  it('reads nothing further when the part has no role', async () => {
    tecdoc.getLegacyArticleIds.mockResolvedValueOnce([]);

    expect(await service.getManufacturers(BOSCH, 'OF-OC115')).toEqual([]);
    expect(tecdoc.getLinkedManufacturers).not.toHaveBeenCalled();
  });

  describe('rememberLinkageRoles', () => {
    // The catalog listing already carries these ids. Without pinning them, the
    // section re-reads each article the first time a visitor expands a row.
    //
    // Written here rather than by the listing itself so that one class owns the
    // key: a second writer building it independently could drift from the reader
    // with nothing failing.
    it('pins every row’s ids under the key the read path uses', async () => {
      await service.rememberLinkageRoles([
        { brandId: '30', articleNumber: 'A1', legacyArticleIds: [555] },
        { brandId: '77', articleNumber: 'A2', legacyArticleIds: [900, 901] },
      ]);

      expect(cache.writeMemos).toHaveBeenCalledWith(
        [
          { key: 'tecdoc:article-legacy-ids:30:A1', value: [555] },
          { key: 'tecdoc:article-legacy-ids:77:A2', value: [900, 901] },
        ],
        24 * 60 * 60,
      );
    });

    // "No roles" belongs at the shorter miss TTL, which only the read path
    // applies — pinning it here would remember it for a whole day.
    it('skips a row with no ids rather than pinning an empty list', async () => {
      await service.rememberLinkageRoles([
        { brandId: '30', articleNumber: 'A1', legacyArticleIds: [] },
      ]);

      expect(cache.writeMemos).toHaveBeenCalledWith([], 24 * 60 * 60);
    });

    // The warmed entry and the read use the same key, so a page a visitor
    // browsed answers the section without a further TecDoc read.
    it('warms the entry the manufacturers read then hits', async () => {
      await service.rememberLinkageRoles([
        { brandId: '30', articleNumber: 'A1', legacyArticleIds: [555] },
      ]);
      const [[warmed]] = cache.writeMemos.mock.calls as [
        [Array<{ key: string }>],
      ];

      await service.getManufacturers(BOSCH, 'A1');
      const readKeys = (cache.cachedArray.mock.calls as [string][]).map(
        ([key]) => key,
      );

      expect(readKeys).toContain(warmed[0].key);
    });
  });

  describe('getManufacturers', () => {
    it('caches by brand and article number (24h hit / 1h miss)', async () => {
      await service.getManufacturers(BOSCH, 'OF-OC115');

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:linked-makes:30:OF-OC115',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
    });

    it('returns the makes of the article', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555]);
      tecdoc.getLinkedManufacturers.mockResolvedValueOnce([
        { manufacturerId: '5', name: 'BMW' },
      ]);

      const result = await service.getManufacturers(BOSCH, 'OF-OC115');

      expect(tecdoc.getLinkedManufacturers).toHaveBeenCalledWith(555);
      expect(result).toEqual([{ manufacturerId: '5', name: 'BMW' }]);
    });

    // A part filed in two roles has its vehicles split across both, so reading
    // one would drop the other's makes from the section entirely.
    it('merges the makes of every role and sorts them by name', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555, 556]);
      tecdoc.getLinkedManufacturers
        .mockResolvedValueOnce([
          { manufacturerId: '16', name: 'VW' },
          { manufacturerId: '5', name: 'BMW' },
        ])
        .mockResolvedValueOnce([
          { manufacturerId: '5', name: 'BMW' },
          { manufacturerId: '1', name: 'AUDI' },
        ]);

      const result = await service.getManufacturers(BOSCH, 'OF-OC115');

      expect(result).toEqual([
        { manufacturerId: '1', name: 'AUDI' },
        { manufacturerId: '5', name: 'BMW' },
        { manufacturerId: '16', name: 'VW' },
      ]);
    });
  });

  describe('getVehiclesByManufacturer', () => {
    it('caches per make on top of the article key', async () => {
      await service.getVehiclesByManufacturer(BOSCH, 'OF-OC115', 5);

      expect(cache.cachedArray).toHaveBeenCalledWith(
        'tecdoc:linked-vehicles:30:OF-OC115:5',
        24 * 60 * 60,
        60 * 60,
        expect.any(Function),
      );
    });

    it('hydrates the make’s linkages and groups them into model series', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([10020, 10021]);
      tecdoc.getVehiclesByIds.mockResolvedValueOnce([
        hydrated(10020, '8506', '3 Series (E90)'),
        hydrated(10021, '8506', '3 Series (E90)'),
      ]);

      const result = await service.getVehiclesByManufacturer(
        BOSCH,
        'OF-OC115',
        5,
      );

      expect(tecdoc.getLinkedTargetIds).toHaveBeenCalledWith(555, 5);
      expect(result).toHaveLength(1);
      expect(result[0].vehicles).toHaveLength(2);
    });

    // Two roles of the same part commonly link to the same vehicle, and
    // hydrating it twice both costs a request and lists the row twice.
    it('de-duplicates the target ids across roles before hydrating', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555, 556]);
      tecdoc.getLinkedTargetIds
        .mockResolvedValueOnce([10020, 10021])
        .mockResolvedValueOnce([10021, 10022]);
      tecdoc.getVehiclesByIds.mockResolvedValueOnce([]);

      await service.getVehiclesByManufacturer(BOSCH, 'OF-OC115', 5);

      expect(tecdoc.getVehiclesByIds).toHaveBeenCalledWith([
        10020, 10021, 10022,
      ]);
    });

    it('skips the hydration read when the make has no linkages', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([]);

      expect(
        await service.getVehiclesByManufacturer(BOSCH, 'OF-OC115', 5),
      ).toEqual([]);
      expect(tecdoc.getVehiclesByIds).not.toHaveBeenCalled();
    });

    // A vehicle record belongs to no article, so the twenty brake pads on a
    // category page resolve the same E90 modifications. Re-hydrating them per
    // article is the same read paid for twenty times.
    it('hydrates only the vehicles it has no memo for', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([10020, 10021, 10022]);
      cache.readMemos.mockResolvedValueOnce([
        hydrated(10020, '8506', '3 Series (E90)'),
        undefined,
        hydrated(10022, '8506', '3 Series (E90)'),
      ]);
      tecdoc.getVehiclesByIds.mockResolvedValueOnce([
        hydrated(10021, '8506', '3 Series (E90)'),
      ]);

      const result = await service.getVehiclesByManufacturer(
        BOSCH,
        'OF-OC115',
        5,
      );

      expect(cache.readMemos).toHaveBeenCalledWith([
        'tecdoc:vehicle:v1:10020',
        'tecdoc:vehicle:v1:10021',
        'tecdoc:vehicle:v1:10022',
      ]);
      expect(tecdoc.getVehiclesByIds).toHaveBeenCalledWith([10021]);
      expect(result[0].vehicles.map((v) => v.vehicleId)).toEqual([
        '10020',
        '10021',
        '10022',
      ]);
    });

    it('pins the vehicles it did have to hydrate', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([10020]);
      cache.readMemos.mockResolvedValueOnce([undefined]);
      const row = hydrated(10020, '8506', '3 Series (E90)');
      tecdoc.getVehiclesByIds.mockResolvedValueOnce([row]);

      await service.getVehiclesByManufacturer(BOSCH, 'OF-OC115', 5);

      expect(cache.writeMemos).toHaveBeenCalledWith(
        [{ key: 'tecdoc:vehicle:v1:10020', value: row }],
        24 * 60 * 60,
      );
    });

    it('reads nothing from TecDoc when every vehicle is memoised', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([10020, 10021]);
      cache.readMemos.mockResolvedValueOnce([
        hydrated(10020, '8506', '3 Series (E90)'),
        hydrated(10021, '8506', '3 Series (E90)'),
      ]);

      await service.getVehiclesByManufacturer(BOSCH, 'OF-OC115', 5);

      expect(tecdoc.getVehiclesByIds).not.toHaveBeenCalled();
    });

    // A carId TecDoc no longer holds comes back from neither the memo nor the
    // hydration read, and must not leave a hole in the list.
    it('drops an id nothing could be resolved for', async () => {
      tecdoc.getLegacyArticleIds.mockResolvedValueOnce([555]);
      tecdoc.getLinkedTargetIds.mockResolvedValueOnce([10020, 99999]);
      cache.readMemos.mockResolvedValueOnce([undefined, undefined]);
      tecdoc.getVehiclesByIds.mockResolvedValueOnce([
        hydrated(10020, '8506', '3 Series (E90)'),
      ]);

      const result = await service.getVehiclesByManufacturer(
        BOSCH,
        'OF-OC115',
        5,
      );

      expect(result.flatMap((series) => series.vehicles)).toHaveLength(1);
    });
  });
});
