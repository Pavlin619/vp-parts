import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import type { Response } from 'express';
import { currentUserOf } from '../auth';

export const PLACE_ORDER_RATE_LIMIT_WINDOW_MS = 60_000;
export const PLACE_ORDER_RATE_LIMIT = 5;

const THROTTLER_NAME = 'place-order';

/**
 * An order is placed by an account, so its allowance follows the account, not
 * the address. A route guard rather than a tracker on the global throttler:
 * that one runs before the token is verified, and must not trust its subject.
 */
@Injectable()
export class PlaceOrderRateLimitGuard implements CanActivate {
  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { clerkId } = currentUserOf(context);
    const { isBlocked, timeToBlockExpire } = await this.storage.increment(
      `${THROTTLER_NAME}:${clerkId}`,
      PLACE_ORDER_RATE_LIMIT_WINDOW_MS,
      PLACE_ORDER_RATE_LIMIT,
      PLACE_ORDER_RATE_LIMIT_WINDOW_MS,
      THROTTLER_NAME,
    );

    if (isBlocked) {
      context
        .switchToHttp()
        .getResponse<Response>()
        .header('Retry-After', String(timeToBlockExpire));

      throw new ThrottlerException();
    }

    return true;
  }
}
