import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { orderPagePath } from '@vp-parts-shop/shared';

interface LinkedOrder {
  id: string;
  orderReference: string;
  customerId: string | null;
}

/**
 * The key that reads a guest's order with no account. Derived from the order
 * id rather than stored, so a retry and a later email can hand out the same key.
 */
@Injectable()
export class OrderAccessKeys {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('ORDER_LINK_SECRET')!;
  }

  keyFor(orderId: string): string {
    return createHmac('sha256', this.secret)
      .update(orderId)
      .digest('base64url');
  }

  matches(orderId: string, key: string | undefined): boolean {
    const expected = Buffer.from(this.keyFor(orderId));
    const given = Buffer.from(key ?? '');

    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** A customer reads their order through the account; only a guest's link carries a key. */
  pagePathFor(order: LinkedOrder): string {
    return order.customerId
      ? orderPagePath(order.orderReference)
      : orderPagePath(order.orderReference, this.keyFor(order.id));
  }
}
