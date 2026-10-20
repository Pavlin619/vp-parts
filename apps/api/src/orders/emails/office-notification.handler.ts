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
import { officeNotificationEmail } from './office-notification.email';

@Injectable()
export class OfficeNotificationHandler implements OutboxHandler, OnModuleInit {
  readonly name = 'office-notification-email';
  readonly eventType = ORDER_PLACED;

  private readonly notifyTo: string;

  constructor(
    private readonly relay: OutboxRelay,
    private readonly orders: OrdersRepository,
    private readonly sender: EmailSender,
    config: ConfigService,
  ) {
    this.notifyTo = config.get<string>('ORDERS_NOTIFY_EMAIL')!;
  }

  onModuleInit(): void {
    this.relay.register(this);
  }

  async handle(event: OutboxMessage): Promise<void> {
    const record = await readPlacedOrder(this.orders, event);
    const order = toOrderDetailDto(record);

    await this.sender.send(
      {
        to: this.notifyTo,
        replyTo: order.contact.email ?? undefined,
        ...officeNotificationEmail(order, record.parcelWeightGrams),
      },
      idempotencyKeyOf(event, this),
    );
  }
}
