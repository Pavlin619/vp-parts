import { Logger } from '@nestjs/common';

export interface TtlMemoOptions<T> {
  /** Names the value in log lines, e.g. "Brand logos". */
  name: string;
  ttlMs: number;
  /** How long a stale value is served for before another load is attempted. */
  retryAfterMs: number;
  load: () => Promise<T>;
}

/**
 * Keeps a derived value in process memory so it is built once per window rather
 * than once per request.
 *
 * Meant for the read-only reference data behind a Redis-cached read: Redis
 * spares us the upstream call, but the caller still pays a round trip and a
 * `JSON.parse` to rebuild the same lookup on every request. Hold the finished
 * structure instead.
 *
 * Two behaviours beyond plain caching, both of which matter when the load is a
 * metered upstream call. Concurrent callers share one in-flight load rather than
 * each starting their own, and a failed refresh keeps serving the previous value
 * — reference data does not go meaningfully stale, and an outage should not turn
 * a working request into a failed one.
 */
export class TtlMemo<T> {
  /**
   * Every live memo. A registry rather than a per-service reset hook so that
   * adding a memo cannot silently leave one behind: an e2e suite shares a single
   * app across cases, and a value memoised in one would otherwise still be
   * served in the next. Bounded in practice — memos belong to singletons.
   */
  private static readonly instances = new Set<{ clear(): void }>();

  private readonly logger = new Logger(TtlMemo.name);
  private cached?: { value: T; expiresAt: number };
  private inFlight?: Promise<T>;

  constructor(private readonly options: TtlMemoOptions<T>) {
    TtlMemo.instances.add(this);
  }

  static clearAll(): void {
    for (const memo of TtlMemo.instances) {
      memo.clear();
    }
  }

  clear(): void {
    this.cached = undefined;
    this.inFlight = undefined;
  }

  async get(): Promise<T> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return this.cached.value;
    }

    this.inFlight ??= this.reload();

    return this.inFlight;
  }

  private async reload(): Promise<T> {
    try {
      const value = await this.options.load();
      this.cached = { value, expiresAt: Date.now() + this.options.ttlMs };

      return value;
    } catch (error) {
      return this.serveStale(error);
    } finally {
      this.inFlight = undefined;
    }
  }

  /**
   * With nothing held there is no degraded answer to give, so the error is the
   * caller's to interpret. It reaches here again on the next call rather than
   * being remembered: a memo that has never loaded is usually a cold start, and
   * whatever it feeds is unlikely to be working either.
   */
  private serveStale(error: unknown): T {
    if (!this.cached) {
      throw error;
    }

    this.cached.expiresAt = Date.now() + this.options.retryAfterMs;
    this.logger.warn(
      `${this.options.name} could not be refreshed; serving the previous copy`,
    );

    return this.cached.value;
  }
}
