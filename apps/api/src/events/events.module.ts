import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { OutboxRelay } from './outbox.relay';
import { OutboxRepository } from './outbox.repository';

/** The transactional outbox and its relay. See docs/ORDERS.md. */
@Module({
  imports: [PrismaModule],
  providers: [OutboxRepository, OutboxRelay],
  exports: [OutboxRepository, OutboxRelay],
})
export class EventsModule {}
