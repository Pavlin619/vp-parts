import { RedisCache } from '../../redis';
import { VehiclesTecDoc } from './vehicles.tecdoc';
import { VehiclesService } from './vehicles.service';

const WEEK = 7 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;

const FACET = [
  { id: 74, name: 'MERCEDES-BENZ', vehicleCount: 3117 },
  { id: 8399, name: 'REZON', vehicleCount: 3 },
  { id: 5, name: 'AUDI', vehicleCount: 1994 },
];

describe('VehiclesService', () => {
  let tecdoc: {
    getManufacturerFacet: jest.Mock;
    getPopularManufacturerIds: jest.Mock;
    getModelSeries: jest.Mock;
    getVehicleVariants: jest.Mock;
    getAssemblyGroupTree: jest.Mock;
  };
  let cachedMock: jest.Mock;
  let service: VehiclesService;

  beforeEach(() => {
    tecdoc = {
      getManufacturerFacet: jest.fn().mockResolvedValue(FACET),
      getPopularManufacturerIds: jest.fn().mockResolvedValue(new Set([5, 74])),
      getModelSeries: jest.fn().mockResolvedValue(['s']),
      getVehicleVariants: jest.fn().mockResolvedValue(['v']),
      getAssemblyGroupTree: jest.fn().mockResolvedValue(['g']),
    };
    cachedMock = jest.fn((_key: string, _ttl: number, loader: () => unknown) =>
      loader(),
    );
    service = new VehiclesService(
      tecdoc as unknown as VehiclesTecDoc,
      { cached: cachedMock } as unknown as RedisCache,
    );
  });

  it('caches manufacturers under the all-manufacturers key for a week', async () => {
    await service.getManufacturers();
    expect(cachedMock).toHaveBeenCalledWith(
      'tecdoc:manufacturers:VL',
      WEEK,
      expect.any(Function),
    );
  });

  describe('getManufacturers', () => {
    // TecDoc answers the make list and its own popularity curation with two
    // unrelated functions, so the merge is the service's and the ordering is
    // what the list is served in.
    it('merges the favoured ids into the facet and orders the result', async () => {
      expect(await service.getManufacturers()).toEqual([
        { id: '74', name: 'MERCEDES-BENZ', isPopular: true },
        { id: '5', name: 'AUDI', isPopular: true },
        { id: '8399', name: 'REZON', isPopular: false },
      ]);
    });

    // Neither read takes anything from the other, so one waiting on the other
    // would double the latency of the slowest page of the selector.
    it('issues both reads together rather than one after the other', async () => {
      let answerFacet: () => void = () => {};
      tecdoc.getManufacturerFacet.mockImplementation(
        () =>
          new Promise((resolve) => {
            answerFacet = () => resolve(FACET);
          }),
      );

      const pending = service.getManufacturers();
      await Promise.resolve();

      expect(tecdoc.getPopularManufacturerIds).toHaveBeenCalled();

      answerFacet();
      await pending;
    });

    // The merged list is cached for a week, so a popularity read swallowed here
    // would pin a flagless list — no popular section at all — for seven days on
    // one bad response. Throwing caches nothing and costs a retry.
    it('fails rather than dropping the popular flag', async () => {
      tecdoc.getPopularManufacturerIds.mockRejectedValue(
        new Error('TecDoc refused'),
      );

      await expect(service.getManufacturers()).rejects.toThrow(
        'TecDoc refused',
      );
    });
  });

  it('caches model series per manufacturer id', async () => {
    await service.getModelSeries(16);
    expect(cachedMock).toHaveBeenCalledWith(
      'tecdoc:model-series:VL:16',
      WEEK,
      expect.any(Function),
    );
    expect(tecdoc.getModelSeries).toHaveBeenCalledWith(16);
  });

  // The tree is held for a week, so a key blind to the scope would go on
  // serving motorcycle makes for seven days after the scope was narrowed.
  it('names the selectable-vehicle scope in every enumerated key', async () => {
    await service.getManufacturers();
    await service.getModelSeries(16);
    await service.getVehicleVariants(2);
    await service.getCategoryTree(10001);

    const keys = cachedMock.mock.calls.map(([key]) => key as string);

    expect(keys.filter((key) => key.includes(':VL'))).toHaveLength(3);
    // Read per vehicle and not scoped — `getArticles` refuses the code anyway.
    expect(keys).toContain('tecdoc:assembly-groups:10001');
  });

  // A day rather than the tree's week: a cached entry read just before it
  // expires hands the browser an image token of that age, and 27.1 h is the
  // oldest one the probe has measured still alive.
  it('caches vehicle variants for a day, not the tree week', async () => {
    const result = await service.getVehicleVariants(2);

    expect(cachedMock).toHaveBeenCalledWith(
      'tecdoc:vehicle-types:VL:2',
      DAY,
      expect.any(Function),
    );
    expect(tecdoc.getVehicleVariants).toHaveBeenCalledWith(2);
    expect(result).toEqual(['v']);
  });

  it('caches the category tree per vehicle id', async () => {
    await service.getCategoryTree(10001);
    expect(cachedMock).toHaveBeenCalledWith(
      'tecdoc:assembly-groups:10001',
      WEEK,
      expect.any(Function),
    );
  });
});
