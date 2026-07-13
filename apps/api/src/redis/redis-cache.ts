import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Thin, reusable Redis read-through cache. Each caller owns its own cache keys
 * and TTLs and wraps one of these helpers around the loader that produces the
 * data, so the key/TTL live next to the call rather than in a per-feature cache
 * class mirroring the source methods 1:1.
 */
@Injectable()
export class RedisCache {
  private readonly logger = new Logger(RedisCache.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async cached<T>(
    key: string,
    ttl: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached !== null) {
      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as T;
    }

    this.logger.debug(`Cache miss: ${key}`);
    const value = await loader();
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    return value;
  }

  async cachedArray<T>(
    key: string,
    hitTtl: number,
    missTtl: number,
    loader: () => Promise<T[]>,
  ): Promise<T[]> {
    const cached = await this.redis.get(key);
    if (cached !== null) {
      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as T[];
    }

    this.logger.debug(`Cache miss: ${key}`);
    const value = await loader();
    const ttl = value.length > 0 ? hitTtl : missTtl;
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    return value;
  }

  /**
   * Caches a paginated result, picking the shorter miss-TTL when the page holds
   * no items so a hopeless query is not pinned in Redis for the full hit-TTL.
   */
  async cachedPaginated<T extends { items: unknown[] }>(
    key: string,
    hitTtl: number,
    missTtl: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached !== null) {
      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as T;
    }

    this.logger.debug(`Cache miss: ${key}`);
    const value = await loader();
    const ttl = value.items.length > 0 ? hitTtl : missTtl;
    await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    return value;
  }
}
