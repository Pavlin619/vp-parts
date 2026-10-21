import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';
import { toBulgarianMobile } from '@vp-parts-shop/shared';
import {
  ClientIpOptions,
  clientIpOptionsFrom,
  resolveClientIp,
} from '../common';
import { countAttempt } from './order-rate-limit';

export const QUICK_ORDER_IP_WINDOW_MS = 10 * 60_000;
export const QUICK_ORDER_IP_LIMIT = 5;
export const QUICK_ORDER_PHONE_WINDOW_MS = 60 * 60_000;
export const QUICK_ORDER_PHONE_LIMIT = 3;

/**
 * A guest has no account to count against, so a quick order is counted by the
 * address it came from and by the phone it names.
 */
@Injectable()
export class QuickOrderRateLimitGuard implements CanActivate {
  private readonly clientIp: ClientIpOptions;

  constructor(
    @Inject(ThrottlerStorage) private readonly storage: ThrottlerStorage,
    config: ConfigService,
  ) {
    this.clientIp = clientIpOptionsFrom(config);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    await countAttempt(this.storage, context, {
      name: 'quick-order-ip',
      key: resolveClientIp(request, this.clientIp),
      limit: QUICK_ORDER_IP_LIMIT,
      windowMs: QUICK_ORDER_IP_WINDOW_MS,
    });

    const phone = phoneNamedIn(request.body);

    if (phone) {
      await countAttempt(this.storage, context, {
        name: 'quick-order-phone',
        key: phone,
        limit: QUICK_ORDER_PHONE_LIMIT,
        windowMs: QUICK_ORDER_PHONE_WINDOW_MS,
      });
    }

    return true;
  }
}

/**
 * Guards run before validation, so the body is still raw. A phone that does
 * not parse is validation's to refuse.
 */
function phoneNamedIn(body: unknown): string | null {
  const phone = (body as { contact?: { phoneNumber?: unknown } } | undefined)
    ?.contact?.phoneNumber;

  return typeof phone === 'string' ? toBulgarianMobile(phone) : null;
}
