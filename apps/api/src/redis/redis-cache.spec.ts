import { Redis } from 'ioredis';
import { RedisCache } from './redis-cache';

describe('RedisCache', () => {
  let redis: {
    get: jest.Mock;
    set: jest.Mock;
    mget: jest.Mock;
    multi: jest.Mock;
  };
  let pipeline: { set: jest.Mock; exec: jest.Mock };
  let cache: RedisCache;

  beforeEach(() => {
    pipeline = { set: jest.fn(), exec: jest.fn().mockResolvedValue([]) };
    pipeline.set.mockReturnValue(pipeline);
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      mget: jest.fn(),
      multi: jest.fn(() => pipeline),
    };
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

    // Callers lean on this to keep a failed read out of the cache — a lookup
    // that threw must be retried next time, not remembered for the whole TTL.
    it('caches nothing when the loader throws', async () => {
      redis.get.mockResolvedValueOnce(null);
      const loader = jest.fn().mockRejectedValue(new Error('not found'));

      await expect(cache.cached('k', 60, loader)).rejects.toThrow('not found');
      expect(redis.set).not.toHaveBeenCalled();
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

  describe('cachedMany', () => {
    /**
     * A row keyed by brand and number, as the hydrated cross-reference rows the
     * primitive exists for are. `keyOf` and `keyOfLoaded` agree on that key,
     * which is what lets the loader answer out of order or short.
     */
    function request(
      items: Array<{ brandId: string; articleNumber: string }>,
      loadMissing: jest.Mock,
    ) {
      const keyOf = (row: { brandId: string; articleNumber: string }) =>
        `row:${row.brandId}:${row.articleNumber}`;

      return { items, ttl: 3600, keyOf, keyOfLoaded: keyOf, loadMissing };
    }

    const bosch = { brandId: '30', articleNumber: 'A1' };
    const mann = { brandId: '72', articleNumber: 'A2' };

    it('returns the cached rows without calling the loader when all hit', async () => {
      redis.mget.mockResolvedValueOnce([
        JSON.stringify(bosch),
        JSON.stringify(mann),
      ]);
      const loadMissing = jest.fn();

      const result = await cache.cachedMany(
        request([bosch, mann], loadMissing),
      );

      expect(redis.mget).toHaveBeenCalledWith(['row:30:A1', 'row:72:A2']);
      expect(result).toEqual([bosch, mann]);
      expect(loadMissing).not.toHaveBeenCalled();
    });

    it('loads every item and pins each row under its own key when all miss', async () => {
      redis.mget.mockResolvedValueOnce([null, null]);
      const loadMissing = jest.fn().mockResolvedValue([bosch, mann]);

      const result = await cache.cachedMany(
        request([bosch, mann], loadMissing),
      );

      expect(loadMissing).toHaveBeenCalledWith([bosch, mann]);
      expect(result).toEqual([bosch, mann]);
      expect(pipeline.set).toHaveBeenCalledWith(
        'row:30:A1',
        JSON.stringify(bosch),
        'EX',
        3600,
      );
      expect(pipeline.set).toHaveBeenCalledWith(
        'row:72:A2',
        JSON.stringify(mann),
        'EX',
        3600,
      );
    });

    // The point of the primitive: the expensive loader is asked only for what
    // Redis did not have, and the answer still arrives in the requested order.
    it('asks the loader for the misses alone and keeps the requested order', async () => {
      redis.mget.mockResolvedValueOnce([null, JSON.stringify(mann)]);
      const loadMissing = jest.fn().mockResolvedValue([bosch]);

      const result = await cache.cachedMany(
        request([bosch, mann], loadMissing),
      );

      expect(loadMissing).toHaveBeenCalledWith([bosch]);
      expect(result).toEqual([bosch, mann]);
      expect(pipeline.set).toHaveBeenCalledTimes(1);
      expect(pipeline.set).toHaveBeenCalledWith(
        'row:30:A1',
        JSON.stringify(bosch),
        'EX',
        3600,
      );
    });

    /**
     * TecDoc answers a 20-id hydration call with 19 rows, so an item the loader
     * cannot produce has to drop out of the result rather than leave a hole in
     * it — and nothing may be pinned in its place.
     */
    it('drops an item the loader returned nothing for, and caches no gap', async () => {
      redis.mget.mockResolvedValueOnce([null, null]);
      const loadMissing = jest.fn().mockResolvedValue([mann]);

      const result = await cache.cachedMany(
        request([bosch, mann], loadMissing),
      );

      expect(result).toEqual([mann]);
      expect(pipeline.set).toHaveBeenCalledTimes(1);
      expect(pipeline.set).toHaveBeenCalledWith(
        'row:72:A2',
        JSON.stringify(mann),
        'EX',
        3600,
      );
    });

    // A loader that answers in TecDoc's order rather than ours is the normal
    // case, so the pairing is by key and never by position.
    it('pairs the loaded rows up by key rather than by position', async () => {
      redis.mget.mockResolvedValueOnce([null, null]);
      const loadMissing = jest.fn().mockResolvedValue([mann, bosch]);

      const result = await cache.cachedMany(
        request([bosch, mann], loadMissing),
      );

      expect(result).toEqual([bosch, mann]);
    });

    it('does not touch Redis or the loader for an empty request', async () => {
      const loadMissing = jest.fn();

      expect(await cache.cachedMany(request([], loadMissing))).toEqual([]);
      expect(redis.mget).not.toHaveBeenCalled();
      expect(redis.multi).not.toHaveBeenCalled();
      expect(loadMissing).not.toHaveBeenCalled();
    });

    it('loads everything when Redis cannot be read', async () => {
      redis.mget.mockRejectedValueOnce(new Error('Redis unavailable'));
      const loadMissing = jest.fn().mockResolvedValue([bosch, mann]);

      const result = await cache.cachedMany(
        request([bosch, mann], loadMissing),
      );

      expect(loadMissing).toHaveBeenCalledWith([bosch, mann]);
      expect(result).toEqual([bosch, mann]);
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

    // Callers pair the answer back up with what they derived the keys from, so
    // a miss has to hold its place rather than shorten the list.
    it('answers a batch read positionally, with a gap where there was no memo', async () => {
      redis.mget.mockResolvedValueOnce(['[1]', null, '[3]']);

      const result = await cache.readMemos<number[]>(['a', 'b', 'c']);

      expect(redis.mget).toHaveBeenCalledWith(['a', 'b', 'c']);
      expect(result).toEqual([[1], undefined, [3]]);
    });

    it('does not call Redis for an empty batch read', async () => {
      expect(await cache.readMemos([])).toEqual([]);
      expect(redis.mget).not.toHaveBeenCalled();
    });

    it('reports every key as a miss when the batch read fails', async () => {
      redis.mget.mockRejectedValueOnce(new Error('Redis unavailable'));

      expect(await cache.readMemos(['a', 'b'])).toEqual([undefined, undefined]);
    });

    // A catalog page pins one memo per row, so these go out together rather
    // than as one round trip each behind the read that just missed.
    it('pins a batch of memos in a single pipeline', async () => {
      await cache.writeMemos(
        [
          { key: 'a', value: [1] },
          { key: 'b', value: [2] },
        ],
        3600,
      );

      expect(redis.multi).toHaveBeenCalledTimes(1);
      expect(pipeline.set).toHaveBeenCalledWith('a', '[1]', 'EX', 3600);
      expect(pipeline.set).toHaveBeenCalledWith('b', '[2]', 'EX', 3600);
      expect(pipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('does not open a pipeline for an empty batch', async () => {
      await cache.writeMemos([], 3600);

      expect(redis.multi).not.toHaveBeenCalled();
    });

    it('swallows a failed batch write', async () => {
      pipeline.exec.mockRejectedValueOnce(new Error('Redis unavailable'));

      await expect(
        cache.writeMemos([{ key: 'a', value: [1] }], 3600),
      ).resolves.toBeUndefined();
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
