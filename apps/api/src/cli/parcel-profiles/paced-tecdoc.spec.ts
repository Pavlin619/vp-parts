import { Clock, PacedTecDoc, TecDocRunAbortedError } from './paced-tecdoc';

class FakeClock implements Clock {
  current = 0;
  sleeps: number[] = [];

  now(): number {
    return this.current;
  }

  sleep(milliseconds: number): Promise<void> {
    this.sleeps.push(milliseconds);
    this.current += milliseconds;

    return Promise.resolve();
  }
}

const OPTIONS = { intervalMs: 1000, initialBackoffMs: 5000, maxAttempts: 3 };

describe('PacedTecDoc', () => {
  let clock: FakeClock;
  let call: jest.Mock;
  let tecDoc: PacedTecDoc;

  beforeEach(() => {
    clock = new FakeClock();
    call = jest.fn().mockResolvedValue({ ok: true });
    tecDoc = new PacedTecDoc({ call }, OPTIONS, clock);
  });

  it('passes the function and params through and returns the reply', async () => {
    call.mockResolvedValueOnce({ articles: [] });

    await expect(tecDoc.call('getArticles', { page: 1 })).resolves.toEqual({
      articles: [],
    });
    expect(call).toHaveBeenCalledWith('getArticles', { page: 1 });
  });

  it('starts calls at least one interval apart', async () => {
    await tecDoc.call('getArticles', {});
    clock.current += 300;
    await tecDoc.call('getArticles', {});

    expect(clock.sleeps).toEqual([700]);
  });

  it('does not wait before the first call or when the interval has passed', async () => {
    await tecDoc.call('getArticles', {});
    clock.current += 5000;
    await tecDoc.call('getArticles', {});

    expect(clock.sleeps).toEqual([]);
  });

  it('retries with a doubling wait and counts every attempt', async () => {
    call
      .mockRejectedValueOnce(new Error('429'))
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ ok: true });

    await tecDoc.call('getArticles', {});

    expect(clock.sleeps).toEqual([5000, 10000]);
    expect(tecDoc.statistics).toEqual({ calls: 3, retries: 2 });
  });

  it('stops the run after three failures in a row', async () => {
    call.mockRejectedValue(new Error('503'));

    await expect(tecDoc.call('getArticles', {})).rejects.toBeInstanceOf(
      TecDocRunAbortedError,
    );
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('forgets earlier failures once a call succeeds', async () => {
    call
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({});

    await tecDoc.call('getArticles', {});
    await expect(tecDoc.call('getArticles', {})).resolves.toEqual({});
  });
});
