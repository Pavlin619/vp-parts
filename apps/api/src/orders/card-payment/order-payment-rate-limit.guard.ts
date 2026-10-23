import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { currentUserOf } from '../../auth';
import { countAttempt } from '../order-rate-limit';

export const ORDER_PAYMENT_RATE_LIMIT_WINDOW_MS = 60_000;
export const ORDER_PAYMENT_RATE_LIMIT = 10;

/** Every session opened is a call to Dominaite, which throttles us in turn. */
@Injectable()
export class OrderPaymentRateLimitGuard implements CanActivate {
  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { clerkId } = currentUserOf(context);

    await countAttempt(this.storage, context, {
      name: 'order-payment',
      key: clerkId,
      limit: ORDER_PAYMENT_RATE_LIMIT,
      windowMs: ORDER_PAYMENT_RATE_LIMIT_WINDOW_MS,
    });

    return true;
  }
}
