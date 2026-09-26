import { ExpiringMemo } from './expiring-memo';

describe('ExpiringMemo', () => {
  let now: number;
  let memo: ExpiringMemo<string>;

  beforeEach(() => {
    now = 0;
    memo = new ExpiringMemo<string>(1000, () => now);
  });

  it('loads once and answers from memory until the value expires', async () => {
    const load = jest.fn().mockResolvedValue('offices');

    await memo.get(load);
    now = 999;
    await expect(memo.get(load)).resolves.toBe('offices');

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('loads again once the value has expired', async () => {
    const load = jest.fn().mockResolvedValue('offices');

    await memo.get(load);
    now = 1000;
    await memo.get(load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares a load still in flight rather than starting a second one', async () => {
    let resolve!: (value: string) => void;
    const load = jest.fn(
      () => new Promise<string>((settle) => (resolve = settle)),
    );

    const first = memo.get(load);
    const second = memo.get(load);
    resolve('offices');

    await expect(Promise.all([first, second])).resolves.toEqual([
      'offices',
      'offices',
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed load so the next read retries', async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce('offices');

    await expect(memo.get(load)).rejects.toThrow('down');
    await expect(memo.get(load)).resolves.toBe('offices');
  });
});
