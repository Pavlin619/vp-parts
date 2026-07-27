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
    const cached = await this.read<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await loader();
    await this.write(key, value, ttl);

    return value;
  }

  async cachedArray<T>(
    key: string,
    hitTtl: number,
    missTtl: number,
    loader: () => Promise<T[]>,
  ): Promise<T[]> {
    const cached = await this.read<T[]>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await loader();
    const ttl = value.length > 0 ? hitTtl : missTtl;
    await this.write(key, value, ttl);

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
    const cached = await this.read<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await loader();
    const ttl = value.items.length > 0 ? hitTtl : missTtl;
    await this.write(key, value, ttl);

    return value;
  }

  /**
   * Reads a memo: a value the cache cannot produce on its own because it falls
   * out of another call as a side effect (e.g. which of several attempts
   * succeeded). Having no loader is what makes it a memo rather than a
   * read-through entry — the caller reads the previous answer, does its own
   * work, and pins the new one with {@link writeMemo}. Prefer the read-through
   * helpers above whenever the value does have a loader of its own.
   */
  async readMemo<T>(key: string): Promise<T | undefined> {
    return this.read<T>(key);
  }

  async writeMemo<T>(key: string, value: T, ttl: number): Promise<void> {
    return this.write(key, value, ttl);
  }

  private async read<T>(key: string): Promise<T | undefined> {
    try {
      const cached = await this.redis.get(key);
      if (cached === null) {
        this.logger.debug(`Cache miss: ${key}`);
        return undefined;
      }

      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as T;
    } catch (error) {
      this.logger.warn(`Cache read failed: ${this.errorMessage(error)}`);
      return undefined;
    }
  }

  private async write<T>(key: string, value: T, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      this.logger.warn(`Cache write failed: ${this.errorMessage(error)}`);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
