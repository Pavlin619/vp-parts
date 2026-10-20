import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisThrottlerStorage } from './redis-throttler-storage';

describe('RedisThrottlerStorage', () => {
  let redis: Redis;
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    redis = new Redis({ lazyConnect: true });
    storage = new RedisThrottlerStorage(redis);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    redis.disconnect();
  });

  const hit = () => storage.increment('client-a', 60_000, 5, 60_000, 'default');

  it('answers with the count Redis keeps', async () => {
    jest.spyOn(redis, 'call').mockResolvedValueOnce([6, 42_000, 1, 60_000]);

    expect(await hit()).toEqual({
      totalHits: 6,
      timeToExpire: 42,
      isBlocked: true,
      timeToBlockExpire: 60,
    });
  });

  it('lets the request through when Redis cannot be reached', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(redis, 'call').mockRejectedValueOnce(new Error('ECONNREFUSED'));

    expect(await hit()).toMatchObject({ isBlocked: false });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });
});
