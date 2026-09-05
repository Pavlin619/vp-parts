import { RedisCache } from '../../redis';
import { VehiclesTecDoc } from './vehicles.tecdoc';
import { VehiclesService } from './vehicles.service';

const WEEK = 7 * 24 * 60 * 60;
const TWELVE_HOURS = 12 * 60 * 60;

describe('VehiclesService', () => {
  let tecdoc: {
    getManufacturers: jest.Mock;
    getModelSeries: jest.Mock;
    getVehicleTypes: jest.Mock;
    getAssemblyGroupTree: jest.Mock;
  };
  let cachedMock: jest.Mock;
  let service: VehiclesService;

  beforeEach(() => {
    tecdoc = {
      getManufacturers: jest.fn().mockResolvedValue(['m']),
      getModelSeries: jest.fn().mockResolvedValue(['s']),
      getVehicleTypes: jest.fn().mockResolvedValue(['v']),
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
      'tecdoc:manufacturers:all',
      WEEK,
      expect.any(Function),
    );
  });

  it('caches model series per manufacturer id', async () => {
    await service.getModelSeries(16);
    expect(cachedMock).toHaveBeenCalledWith(
      'tecdoc:model-series:16',
      WEEK,
      expect.any(Function),
    );
    expect(tecdoc.getModelSeries).toHaveBeenCalledWith(16);
  });

  // Half the tree's TTL is not a rounding of a week: a cached entry read just
  // before it expires hands the browser an image token of that age, and 20.1 h
  // is the oldest one measured still alive.
  it('caches vehicle variants for twelve hours, not the tree week', async () => {
    const result = await service.getVehicleVariants(2);

    expect(cachedMock).toHaveBeenCalledWith(
      'tecdoc:vehicle-types:2',
      TWELVE_HOURS,
      expect.any(Function),
    );
    expect(tecdoc.getVehicleTypes).toHaveBeenCalledWith(2);
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
