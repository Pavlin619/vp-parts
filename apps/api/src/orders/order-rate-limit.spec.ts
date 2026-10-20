import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { countAttempt } from './order-rate-limit';

const BUCKET = {
  name: 'example',
  key: 'subject-1',
  limit: 3,
  windowMs: 60_000,
};

describe('countAttempt', () => {
  const increment = jest.fn();
  const header = jest.fn();
  const storage = { increment } as unknown as ThrottlerStorage;
  const context = {
    switchToHttp: () => ({ getResponse: () => ({ header }) }),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('counts the attempt under the bucket’s name and key, blocking for one window', async () => {
    increment.mockResolvedValue({ isBlocked: false, timeToBlockExpire: 0 });

    await countAttempt(storage, context, BUCKET);

    expect(increment).toHaveBeenCalledWith(
      'example:subject-1',
      60_000,
      3,
      60_000,
      'example',
    );
    expect(header).not.toHaveBeenCalled();
  });

  it('refuses an attempt over the limit, saying when to retry', async () => {
    increment.mockResolvedValue({ isBlocked: true, timeToBlockExpire: 42 });

    await expect(countAttempt(storage, context, BUCKET)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(header).toHaveBeenCalledWith('Retry-After', '42');
  });
});
