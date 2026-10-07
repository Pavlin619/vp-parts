import { Logger } from '@nestjs/common';
import type { TecDocTransport } from '../../tecdoc';

export interface Clock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export interface PacingOptions {
  /** Least time between the starts of two calls. */
  intervalMs: number;
  /** Wait before the first retry; doubles on each further one. */
  initialBackoffMs: number;
  maxAttempts: number;
}

export interface CallStatistics {
  calls: number;
  retries: number;
}

/**
 * TecAlliance publishes no rate limit, so a bulk run goes one call at a time at
 * a pace known to be accepted, and stops rather than keep pushing a refusing
 * service.
 */
export const DEFAULT_PACING: PacingOptions = {
  intervalMs: 1000,
  initialBackoffMs: 5000,
  maxAttempts: 3,
};

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export class TecDocRunAbortedError extends Error {
  constructor(functionName: string, attempts: number, cause: unknown) {
    super(`TecDoc ${functionName} failed ${attempts} times in a row`, {
      cause,
    });
  }
}

/** The one place a bulk run talks to TecDoc: paced, retried, counted. */
export class PacedTecDoc {
  private readonly logger = new Logger(PacedTecDoc.name);
  private readonly counts: CallStatistics = { calls: 0, retries: 0 };
  private lastStartedAt: number | null = null;

  constructor(
    private readonly transport: Pick<TecDocTransport, 'call'>,
    private readonly options: PacingOptions,
    private readonly clock: Clock,
  ) {}

  get statistics(): CallStatistics {
    return { ...this.counts };
  }

  async call<T>(
    functionName: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    let backoffMs = this.options.initialBackoffMs;
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      if (attempt > 1) {
        this.counts.retries += 1;
        this.logger.warn(`Retrying ${functionName} in ${backoffMs}ms`);
        await this.clock.sleep(backoffMs);
        backoffMs *= 2;
      }

      await this.waitForTurn();

      try {
        this.counts.calls += 1;

        return await this.transport.call<T>(functionName, params);
      } catch (error) {
        lastError = error;
      }
    }

    throw new TecDocRunAbortedError(
      functionName,
      this.options.maxAttempts,
      lastError,
    );
  }

  private async waitForTurn(): Promise<void> {
    if (this.lastStartedAt !== null) {
      const wait =
        this.lastStartedAt + this.options.intervalMs - this.clock.now();

      if (wait > 0) {
        await this.clock.sleep(wait);
      }
    }

    this.lastStartedAt = this.clock.now();
  }
}
