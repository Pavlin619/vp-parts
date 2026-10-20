import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  OutboxHandler,
  OutboxMessage,
  OutboxRelay,
  SqsPublisher,
} from '../events';
import { ORDER_PLACED, orderIdOf } from './order-placed.event';

/** Tells the backoffice, through `shop-events`, that an order was placed. */
@Injectable()
export class OrderPlacedPublisher implements OutboxHandler, OnModuleInit {
  readonly name = 'shop-events-publisher';
  readonly eventType = ORDER_PLACED;

  constructor(
    private readonly relay: OutboxRelay,
    private readonly publisher: SqsPublisher,
  ) {}

  onModuleInit(): void {
    this.relay.register(this);
  }

  async handle(event: OutboxMessage): Promise<void> {
    await this.publisher.publish(event, { orderId: orderIdOf(event) });
  }
}
