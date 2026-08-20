import { batched, mapWithConcurrency } from './concurrency';

function idSequence(length: number): number[] {
  return Array.from({ length }, (_, index) => index + 1);
}

describe('batched', () => {
  it('splits a list into consecutive chunks of the given size', () => {
    expect(batched(idSequence(7), 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('returns a single chunk when the list is shorter than the size', () => {
    expect(batched([1, 2], 25)).toEqual([[1, 2]]);
  });

  it('returns no chunks for an empty list', () => {
    expect(batched([], 25)).toEqual([]);
  });
});

describe('mapWithConcurrency', () => {
  /** A promise the test finishes on demand, to hold a slot open. */
  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((settle) => {
      resolve = settle;
    });

    return { promise, resolve };
  }

  /** Lets every already-scheduled continuation run before asserting. */
  function flush(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  /** Resolves after every other pending continuation, so it finishes last. */
  function settleLate<T>(value: T): Promise<T> {
    return new Promise((resolve) => setImmediate(() => resolve(value)));
  }

  it('runs every item and answers in the order they were given', async () => {
    const result = await mapWithConcurrency(idSequence(5), 2, (item) =>
      // The first item finishes last, so completion order cannot be the answer.
      item === 1 ? settleLate(item * 10) : Promise.resolve(item * 10),
    );

    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it('keeps at most the given number of tasks in flight', async () => {
    let inFlight = 0;
    let peakInFlight = 0;

    await mapWithConcurrency(idSequence(20), 4, (item) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);

      return new Promise<number>((resolve) => {
        setImmediate(() => {
          inFlight -= 1;
          resolve(item);
        });
      });
    });

    expect(peakInFlight).toBe(4);
  });

  it('starts a waiting item as soon as a running one finishes', async () => {
    const running = deferred();
    const started: number[] = [];

    const all = mapWithConcurrency(idSequence(2), 1, (item) => {
      started.push(item);

      return item === 1 ? running.promise : Promise.resolve();
    });

    await flush();
    expect(started).toEqual([1]);

    running.resolve();
    await all;

    expect(started).toEqual([1, 2]);
  });

  it('spawns no more workers than there are items', async () => {
    let peakInFlight = 0;
    let inFlight = 0;

    await mapWithConcurrency([1, 2], 8, (item) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      inFlight -= 1;

      return Promise.resolve(item);
    });

    expect(peakInFlight).toBe(1);
  });

  it('runs nothing for an empty list', async () => {
    const task = jest.fn();

    expect(await mapWithConcurrency([], 4, task)).toEqual([]);
    expect(task).not.toHaveBeenCalled();
  });

  it('fails the whole map when one item fails', async () => {
    await expect(
      mapWithConcurrency(idSequence(4), 2, (item) =>
        item === 2
          ? Promise.reject(new Error('upstream unavailable'))
          : Promise.resolve(item),
      ),
    ).rejects.toThrow('upstream unavailable');
  });

  // The answer is already lost once one item fails, so the remaining upstream
  // calls would be spent on a result nothing will read.
  it('starts no further items once one has failed', async () => {
    const attempted: number[] = [];

    await expect(
      mapWithConcurrency(idSequence(10), 1, (item) => {
        attempted.push(item);

        return item === 2
          ? Promise.reject(new Error('upstream unavailable'))
          : Promise.resolve(item);
      }),
    ).rejects.toThrow('upstream unavailable');

    expect(attempted).toEqual([1, 2]);
  });

  // A limit of zero would spawn no workers at all and answer with a list of
  // holes, which reads as a successful empty result rather than a mistake.
  it.each([0, -1, 1.5])('rejects a limit of %p', async (limit) => {
    await expect(
      mapWithConcurrency([1], limit, () => Promise.resolve(1)),
    ).rejects.toThrow('positive integer');
  });
});
