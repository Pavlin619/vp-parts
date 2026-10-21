import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { currentUserOf } from '../auth';
import { countAttempt } from './order-rate-limit';

export const PLACE_ORDER_RATE_LIMIT_WINDOW_MS = 60_000;
export const PLACE_ORDER_RATE_LIMIT = 5;

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

    await countAttempt(this.storage, context, {
      name: 'place-order',
      key: clerkId,
      limit: PLACE_ORDER_RATE_LIMIT,
      windowMs: PLACE_ORDER_RATE_LIMIT_WINDOW_MS,
    });

    return true;
  }
}
