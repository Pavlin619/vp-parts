import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import {
  PLACE_ORDER_RATE_LIMIT,
  PLACE_ORDER_RATE_LIMIT_WINDOW_MS,
  PlaceOrderRateLimitGuard,
} from './place-order-rate-limit.guard';

const ALLOWED = {
  totalHits: 1,
  timeToExpire: 60,
  isBlocked: false,
  timeToBlockExpire: 0,
};

describe('PlaceOrderRateLimitGuard', () => {
  const increment = jest.fn();
  const header = jest.fn();

  let guard: PlaceOrderRateLimitGuard;

  const contextFor = (user?: { clerkId: string }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => ({ header }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    jest.resetAllMocks();
    increment.mockResolvedValue(ALLOWED);

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlaceOrderRateLimitGuard,
        { provide: ThrottlerStorage, useValue: { increment } },
      ],
    }).compile();

    guard = moduleRef.get(PlaceOrderRateLimitGuard);
  });

  it('counts each attempt against the customer, not the address', async () => {
    await expect(
      guard.canActivate(contextFor({ clerkId: 'user_1' })),
    ).resolves.toBe(true);

    expect(increment).toHaveBeenCalledWith(
      'place-order:user_1',
      PLACE_ORDER_RATE_LIMIT_WINDOW_MS,
      PLACE_ORDER_RATE_LIMIT,
      PLACE_ORDER_RATE_LIMIT_WINDOW_MS,
      'place-order',
    );
  });

  it('refuses a customer over the limit, saying when to retry', async () => {
    increment.mockResolvedValue({
      ...ALLOWED,
      totalHits: PLACE_ORDER_RATE_LIMIT + 1,
      isBlocked: true,
      timeToBlockExpire: 42,
    });

    await expect(
      guard.canActivate(contextFor({ clerkId: 'user_1' })),
    ).rejects.toBeInstanceOf(ThrottlerException);
    expect(header).toHaveBeenCalledWith('Retry-After', '42');
  });

  // Runs after JwtGuard, so a missing user means the guard was wired wrong.
  it('refuses rather than count a request with no signed-in customer', async () => {
    await expect(guard.canActivate(contextFor())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(increment).not.toHaveBeenCalled();
  });
});
