import { Redis } from 'ioredis';
import { RedisCache } from './redis-cache';

describe('RedisCache', () => {
  let redis: { get: jest.Mock; set: jest.Mock };
  let cache: RedisCache;

  beforeEach(() => {
    redis = { get: jest.fn(), set: jest.fn() };
    cache = new RedisCache(redis as unknown as Redis);
  });

  describe('cached', () => {
    it('returns the parsed cached value on a hit without calling the loader', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify({ id: '1' }));
      const loader = jest.fn();

      const result = await cache.cached('k', 60, loader);

      expect(result).toEqual({ id: '1' });
      expect(loader).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('loads and stores with the given TTL on a miss', async () => {
      redis.get.mockResolvedValueOnce(null);
      const loader = jest.fn().mockResolvedValue({ id: '2' });

      const result = await cache.cached('k', 60, loader);

      expect(result).toEqual({ id: '2' });
      expect(redis.set).toHaveBeenCalledWith(
        'k',
        JSON.stringify({ id: '2' }),
        'EX',
        60,
      );
    });

    it('returns the loaded value when Redis cannot read or write', async () => {
      redis.get.mockRejectedValueOnce(new Error('Redis unavailable'));
      redis.set.mockRejectedValueOnce(new Error('Redis unavailable'));
      const loader = jest.fn().mockResolvedValue({ id: '2' });

      await expect(cache.cached('k', 60, loader)).resolves.toEqual({ id: '2' });
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('cachedArray', () => {
    it('uses the hit TTL when the loaded array is non-empty', async () => {
      redis.get.mockResolvedValueOnce(null);
      const loader = jest.fn().mockResolvedValue([1, 2]);

      await cache.cachedArray('k', 3600, 60, loader);

      expect(redis.set).toHaveBeenCalledWith('k', '[1,2]', 'EX', 3600);
    });

    it('uses the miss TTL when the loaded array is empty', async () => {
      redis.get.mockResolvedValueOnce(null);
      const loader = jest.fn().mockResolvedValue([]);

      await cache.cachedArray('k', 3600, 60, loader);

      expect(redis.set).toHaveBeenCalledWith('k', '[]', 'EX', 60);
    });
  });

  describe('memo', () => {
    it('returns the parsed memo on a hit', async () => {
      redis.get.mockResolvedValueOnce(JSON.stringify('WA5432'));

      await expect(cache.readMemo('k')).resolves.toBe('WA5432');
    });

    it('returns undefined when nothing is pinned', async () => {
      redis.get.mockResolvedValueOnce(null);

      await expect(cache.readMemo('k')).resolves.toBeUndefined();
    });

    it('pins a value with the given TTL', async () => {
      await cache.writeMemo('k', 'WA5432', 3600);

      expect(redis.set).toHaveBeenCalledWith('k', '"WA5432"', 'EX', 3600);
    });

    // A memo is an optimisation, so an unreachable Redis must degrade to "no
    // memo" rather than fail the request that was reading it.
    it('reports no memo when Redis cannot be read, and swallows a failed write', async () => {
      redis.get.mockRejectedValueOnce(new Error('Redis unavailable'));
      redis.set.mockRejectedValueOnce(new Error('Redis unavailable'));

      await expect(cache.readMemo('k')).resolves.toBeUndefined();
      await expect(
        cache.writeMemo('k', 'WA5432', 3600),
      ).resolves.toBeUndefined();
    });
  });

  describe('cachedPaginated', () => {
    it('uses the miss TTL when the page has no items', async () => {
      redis.get.mockResolvedValueOnce(null);
      const loader = jest.fn().mockResolvedValue({ total: 0, items: [] });

      await cache.cachedPaginated('k', 3600, 600, loader);

      expect(redis.set).toHaveBeenCalledWith(
        'k',
        JSON.stringify({ total: 0, items: [] }),
        'EX',
        600,
      );
    });

    it('uses the hit TTL when the page has items', async () => {
      redis.get.mockResolvedValueOnce(null);
      const loader = jest.fn().mockResolvedValue({ total: 1, items: [{}] });

      await cache.cachedPaginated('k', 3600, 600, loader);

      expect(redis.set).toHaveBeenCalledWith(
        'k',
        JSON.stringify({ total: 1, items: [{}] }),
        'EX',
        3600,
      );
    });
  });
});
