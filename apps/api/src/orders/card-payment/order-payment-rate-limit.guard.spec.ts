import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import {
  ORDER_PAYMENT_RATE_LIMIT,
  ORDER_PAYMENT_RATE_LIMIT_WINDOW_MS,
  OrderPaymentRateLimitGuard,
} from './order-payment-rate-limit.guard';

const ALLOWED = {
  totalHits: 1,
  timeToExpire: 60,
  isBlocked: false,
  timeToBlockExpire: 0,
};

describe('OrderPaymentRateLimitGuard', () => {
  const increment = jest.fn();
  const header = jest.fn();

  let guard: OrderPaymentRateLimitGuard;

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { clerkId: 'user_1' } }),
      getResponse: () => ({ header }),
    }),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    jest.resetAllMocks();
    increment.mockResolvedValue(ALLOWED);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrderPaymentRateLimitGuard,
        { provide: ThrottlerStorage, useValue: { increment } },
      ],
    }).compile();

    guard = moduleRef.get(OrderPaymentRateLimitGuard);
  });

  it('counts each attempt against the customer, apart from placing orders', async () => {
    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(increment).toHaveBeenCalledWith(
      'order-payment:user_1',
      ORDER_PAYMENT_RATE_LIMIT_WINDOW_MS,
      ORDER_PAYMENT_RATE_LIMIT,
      ORDER_PAYMENT_RATE_LIMIT_WINDOW_MS,
      'order-payment',
    );
  });

  it('refuses a customer over the limit', async () => {
    increment.mockResolvedValue({
      ...ALLOWED,
      isBlocked: true,
      timeToBlockExpire: 42,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ThrottlerException,
    );
    expect(header).toHaveBeenCalledWith('Retry-After', '42');
  });
});
