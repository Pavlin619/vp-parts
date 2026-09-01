import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * A batch read-through: the items wanted, how each one is keyed, and a loader
 * for those the cache lacked.
 *
 * `keyOfLoaded` is what pairs the loader's answer back onto the request, so a
 * loader may answer in its own order and may answer short — an item nothing was
 * loaded for drops out of the result rather than leaving a hole in it. Both key
 * functions must agree on the key for one thing; the usual shape is a single
 * function over the identity both the item and the value carry.
 */
export interface CachedManyRequest<Item, Value> {
  items: Item[];
  ttl: number;
  keyOf: (item: Item) => string;
  keyOfLoaded: (value: Value) => string;
  loadMissing: (missing: Item[]) => Promise<Value[]>;
}

/**
 * A shorter TTL for an answer the caller judges empty, so a hopeless query is
 * not pinned for the full hit-TTL. Optional on {@link RedisCache.cached}
 * because most values have no such notion — a brand list is a brand list —
 * while only the caller knows which field carries the emptiness.
 */
export interface EmptyAnswerTtl<T> {
  missTtl: number;
  isEmpty: (value: T) => boolean;
}

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
    emptyAnswer?: EmptyAnswerTtl<T>,
  ): Promise<T> {
    const cached = await this.read<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await loader();
    await this.write(key, value, this.ttlFor(value, ttl, emptyAnswer));

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
   * Reads many entries of one kind in a single round trip, loading only those
   * Redis did not have and pinning each loaded one under its own key.
   *
   * For a list whose *order* is decided per request while its *rows* are stable:
   * a page-shaped entry would serve yesterday's ordering, and per-row entries
   * survive both a reordering and the same row appearing in another list. See
   * {@link CachedManyRequest} for why the loader is free to answer short or out
   * of order.
   */
  async cachedMany<Item, Value>(
    request: CachedManyRequest<Item, Value>,
  ): Promise<Value[]> {
    const { items, keyOf, keyOfLoaded, ttl, loadMissing } = request;

    if (items.length === 0) {
      return [];
    }

    const cached = await this.readMemos<Value>(items.map(keyOf));
    const missing = items.filter((_, index) => cached[index] === undefined);
    const loaded = missing.length === 0 ? [] : await loadMissing(missing);

    await this.writeMemos(
      loaded.map((value) => ({ key: keyOfLoaded(value), value })),
      ttl,
    );

    const loadedByKey = new Map(
      loaded.map((value) => [keyOfLoaded(value), value]),
    );

    return items
      .map((item, index) => cached[index] ?? loadedByKey.get(keyOf(item)))
      .filter((value): value is Value => value !== undefined);
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

  /**
   * Reads several memos in one round trip, answering positionally: entry `i` is
   * the value for key `i`, or `undefined` where there was none. Callers pair the
   * result back up with whatever they derived the keys from, so the alignment
   * matters more than the order Redis happens to return.
   *
   * An unreachable Redis reports every key as a miss rather than throwing —
   * these are optimisations, and the caller has a loader for the ones it lacks.
   */
  async readMemos<T>(keys: string[]): Promise<Array<T | undefined>> {
    if (keys.length === 0) {
      return [];
    }

    try {
      const values = await this.redis.mget(keys);

      return values.map((value) =>
        value === null ? undefined : (JSON.parse(value) as T),
      );
    } catch (error) {
      this.logger.warn(`Cache read failed: ${this.errorMessage(error)}`);

      return keys.map(() => undefined);
    }
  }

  async writeMemo<T>(key: string, value: T, ttl: number): Promise<void> {
    return this.write(key, value, ttl);
  }

  /**
   * Pins several memos in one round trip. A catalog page memoises a value per
   * row, and writing them one at a time would hang twenty round trips off the
   * read that just missed.
   */
  async writeMemos<T>(
    entries: Array<{ key: string; value: T }>,
    ttl: number,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    try {
      const pipeline = this.redis.multi();

      for (const { key, value } of entries) {
        pipeline.set(key, JSON.stringify(value), 'EX', ttl);
      }

      await pipeline.exec();
    } catch (error) {
      this.logger.warn(`Cache write failed: ${this.errorMessage(error)}`);
    }
  }

  private ttlFor<T>(
    value: T,
    hitTtl: number,
    emptyAnswer: EmptyAnswerTtl<T> | undefined,
  ): number {
    if (emptyAnswer === undefined) {
      return hitTtl;
    }

    return emptyAnswer.isEmpty(value) ? emptyAnswer.missTtl : hitTtl;
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
