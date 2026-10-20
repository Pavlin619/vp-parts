import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailSender } from '../../email';
import {
  idempotencyKeyOf,
  OutboxHandler,
  OutboxMessage,
  OutboxRelay,
} from '../../events';
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
    config: ConfigService,
  ) {
    this.shop = shopDetailsFrom(config);
  }

  onModuleInit(): void {
    this.relay.register(this);
  }

  async handle(event: OutboxMessage): Promise<void> {
    const order = toOrderDetailDto(await readPlacedOrder(this.orders, event));

    await this.sender.send(
      {
        to: order.contact.email,
        replyTo: this.shop.seller.email,
        ...orderConfirmationEmail(order, this.shop),
      },
      idempotencyKeyOf(event, this),
    );
  }
}
