import { Inject, Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis-cache';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorageRedisService['increment']>
>;

const UNCOUNTED: ThrottlerStorageRecord = {
  totalHits: 0,
  timeToExpire: 0,
  isBlocked: false,
  timeToBlockExpire: 0,
};

/**
 * One count for every API instance, on the shared connection. Fails open, like
 * RedisCache: a Redis outage must not refuse every request the shop serves.
 */
@Injectable()
export class RedisThrottlerStorage extends ThrottlerStorageRedisService {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(@Inject(REDIS_CLIENT) redis: Redis) {
    super(redis);
  }

  override async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await super.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Rate limit not counted: ${reason}`);

      return UNCOUNTED;
    }
  }
}
