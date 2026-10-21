import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@vp-parts-shop/shared';
import { EmailSender } from '../../email';
import {
  idempotencyKeyOf,
  OutboxHandler,
  OutboxMessage,
  OutboxRelay,
} from '../../events';
import { OrderAccessKeys } from '../order-access-keys';
import { ORDER_PLACED, readPlacedOrder } from '../order-placed.event';
import { toOrderDetailDto } from '../orders.mapper';
import { OrdersRepository } from '../orders.repository';
import { orderConfirmationEmail } from './order-confirmation.email';
import { ShopDetails, shopDetailsFrom } from './shop-details';

@Injectable()
export class OrderConfirmationHandler implements OutboxHandler, OnModuleInit {
  readonly name = 'order-confirmation-email';
  readonly eventType = ORDER_PLACED;

  private readonly shop: ShopDetails;

  constructor(
    private readonly relay: OutboxRelay,
    private readonly orders: OrdersRepository,
    private readonly sender: EmailSender,
    private readonly accessKeys: OrderAccessKeys,
    config: ConfigService,
  ) {
    this.shop = shopDetailsFrom(config);
  }

  onModuleInit(): void {
    this.relay.register(this);
  }

  async handle(event: OutboxMessage): Promise<void> {
    const record = await readPlacedOrder(this.orders, event);
    const order = toOrderDetailDto(record);

    // A guest's email is unverified, so it is written to only once the call
    // has confirmed the order — docs/ORDERS.md → "`OrderPlaced`".
    if (
      order.status === OrderStatus.AWAITING_CONFIRMATION ||
      !order.contact.email
    ) {
      return;
    }

    await this.sender.send(
      {
        to: order.contact.email,
        replyTo: this.shop.seller.email,
        ...orderConfirmationEmail(
          order,
          this.shop,
          this.accessKeys.pagePathFor(record),
        ),
      },
      idempotencyKeyOf(event, this),
    );
  }
}
