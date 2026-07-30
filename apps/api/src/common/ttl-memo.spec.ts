import { TtlMemo } from './ttl-memo';

const TTL_MS = 1_000;
const RETRY_AFTER_MS = 500;

function memoOf<T>(load: () => Promise<T>) {
  return new TtlMemo<T>({
    name: 'test value',
    ttlMs: TTL_MS,
    retryAfterMs: RETRY_AFTER_MS,
    load,
  });
}

/** Lets a test settle the load exactly when it wants to. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('TtlMemo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('loads once and serves the same value while it is fresh', async () => {
    const load = jest.fn().mockResolvedValue('value');
    const memo = memoOf(load);

    await expect(memo.get()).resolves.toBe('value');
    await expect(memo.get()).resolves.toBe('value');

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reloads once the value has expired', async () => {
    const load = jest
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValue('second');
    const memo = memoOf(load);

    await memo.get();
    jest.advanceTimersByTime(TTL_MS + 1);

    await expect(memo.get()).resolves.toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  // Without this, a cold memo under concurrent load fans every waiting request
  // out into its own upstream call — the stampede the memo exists to prevent.
  it('shares one in-flight load across concurrent callers', async () => {
    const pending = deferred<string>();
    const load = jest.fn().mockReturnValue(pending.promise);
    const memo = memoOf(load);

    const waiters = Promise.all([memo.get(), memo.get(), memo.get()]);
    pending.resolve('value');

    await expect(waiters).resolves.toEqual(['value', 'value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  describe('when a refresh fails', () => {
    it('serves the previous value rather than propagating the error', async () => {
      const load = jest
        .fn()
        .mockResolvedValueOnce('first')
        .mockRejectedValue(new Error('upstream down'));
      const memo = memoOf(load);

      await memo.get();
      jest.advanceTimersByTime(TTL_MS + 1);

      await expect(memo.get()).resolves.toBe('first');
    });

    // Otherwise every request during an outage pays the upstream timeout again.
    it('holds the stale value for the retry window before trying again', async () => {
      const load = jest
        .fn()
        .mockResolvedValueOnce('first')
        .mockRejectedValue(new Error('upstream down'));
      const memo = memoOf(load);

      await memo.get();
      jest.advanceTimersByTime(TTL_MS + 1);
      await memo.get();
      expect(load).toHaveBeenCalledTimes(2);

      await memo.get();
      expect(load).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(RETRY_AFTER_MS + 1);
      await memo.get();
      expect(load).toHaveBeenCalledTimes(3);
    });

    it('recovers once the load succeeds again', async () => {
      const load = jest
        .fn()
        .mockResolvedValueOnce('first')
        .mockRejectedValueOnce(new Error('upstream down'))
        .mockResolvedValue('second');
      const memo = memoOf(load);

      await memo.get();
      jest.advanceTimersByTime(TTL_MS + 1);
      await memo.get();
      jest.advanceTimersByTime(RETRY_AFTER_MS + 1);

      await expect(memo.get()).resolves.toBe('second');
    });

    // Nothing to serve, so the caller decides what a missing value means.
    it('propagates the error when it has never held a value', async () => {
      const memo = memoOf(
        jest.fn().mockRejectedValue(new Error('upstream down')),
      );

      await expect(memo.get()).rejects.toThrow('upstream down');
    });

    it('retries on the next call after failing with no value to fall back on', async () => {
      const load = jest
        .fn()
        .mockRejectedValueOnce(new Error('upstream down'))
        .mockResolvedValue('value');
      const memo = memoOf(load);

      await expect(memo.get()).rejects.toThrow('upstream down');

      await expect(memo.get()).resolves.toBe('value');
    });
  });
});
