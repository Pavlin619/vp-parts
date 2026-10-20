import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import {
  QUICK_ORDER_IP_LIMIT,
  QUICK_ORDER_IP_WINDOW_MS,
  QUICK_ORDER_PHONE_LIMIT,
  QUICK_ORDER_PHONE_WINDOW_MS,
  QuickOrderRateLimitGuard,
} from './quick-order-rate-limit.guard';

const ALLOWED = { isBlocked: false, timeToBlockExpire: 0 };
const BLOCKED = { isBlocked: true, timeToBlockExpire: 42 };

describe('QuickOrderRateLimitGuard', () => {
  const increment = jest.fn();
  const header = jest.fn();

  let guard: QuickOrderRateLimitGuard;

  const contextFor = (body: unknown, headers: object = {}) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ body, headers, ip: '203.0.113.7' }),
        getResponse: () => ({ header }),
      }),
    }) as unknown as ExecutionContext;

  const bodyWithPhone = (phoneNumber: unknown) => ({
    contact: { firstName: 'Мария', lastName: 'Иванова', phoneNumber },
  });

  const keysCounted = () => increment.mock.calls.map(([key]) => key as string);

  beforeEach(async () => {
    jest.resetAllMocks();
    increment.mockResolvedValue(ALLOWED);

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuickOrderRateLimitGuard,
        { provide: ThrottlerStorage, useValue: { increment } },
        {
          provide: ConfigService,
          useValue: { get: (_key: string, fallback?: unknown) => fallback },
        },
      ],
    }).compile();

    guard = moduleRef.get(QuickOrderRateLimitGuard);
  });

  it('counts each attempt against the address and against the phone, in E.164', async () => {
    await expect(
      guard.canActivate(contextFor(bodyWithPhone('0888 765 432'))),
    ).resolves.toBe(true);

    expect(increment).toHaveBeenCalledWith(
      'quick-order-ip:203.0.113.7',
      QUICK_ORDER_IP_WINDOW_MS,
      QUICK_ORDER_IP_LIMIT,
      QUICK_ORDER_IP_WINDOW_MS,
      'quick-order-ip',
    );
    expect(increment).toHaveBeenCalledWith(
      'quick-order-phone:+359888765432',
      QUICK_ORDER_PHONE_WINDOW_MS,
      QUICK_ORDER_PHONE_LIMIT,
      QUICK_ORDER_PHONE_WINDOW_MS,
      'quick-order-phone',
    );
  });

  it('reads the address by the global throttler’s rule', async () => {
    await guard.canActivate(
      contextFor(bodyWithPhone('0888 765 432'), {
        'x-forwarded-for': '198.51.100.1',
      }),
    );

    expect(keysCounted()).toContain('quick-order-ip:203.0.113.7');
  });

  it('refuses an address over its limit without spending the phone’s allowance', async () => {
    increment.mockResolvedValueOnce(BLOCKED);

    await expect(
      guard.canActivate(contextFor(bodyWithPhone('0888 765 432'))),
    ).rejects.toBeInstanceOf(ThrottlerException);
    expect(header).toHaveBeenCalledWith('Retry-After', '42');
    expect(keysCounted()).toEqual(['quick-order-ip:203.0.113.7']);
  });

  it('refuses a phone over its limit', async () => {
    increment.mockResolvedValueOnce(ALLOWED).mockResolvedValueOnce(BLOCKED);

    await expect(
      guard.canActivate(contextFor(bodyWithPhone('0888 765 432'))),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  // Guards run before validation, which refuses these once the guard lets them by.
  it.each([
    ['a phone that is not a mobile', bodyWithPhone('02 987 6543')],
    ['a phone that is not text', bodyWithPhone(888765432)],
    ['no contact', {}],
    ['no body', undefined],
  ])('counts only the address for %s', async (_case, body) => {
    await expect(guard.canActivate(contextFor(body))).resolves.toBe(true);

    expect(keysCounted()).toEqual(['quick-order-ip:203.0.113.7']);
  });
});
