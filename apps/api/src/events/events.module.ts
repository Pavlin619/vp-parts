import { SQSClient } from '@aws-sdk/client-sqs';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma';
import { OutboxRelay } from './outbox.relay';
import { OutboxRepository } from './outbox.repository';
import { SQS_CLIENT, SqsPublisher } from './sqs.publisher';

// The SDK sets no deadline of its own, and a hung send would hold the relay's batch.
const SQS_CONNECTION_TIMEOUT_MS = 5_000;
const SQS_REQUEST_TIMEOUT_MS = 10_000;

/** The transactional outbox, its relay, and the SQS publisher. See docs/ORDERS.md. */
@Module({
  imports: [PrismaModule],
  providers: [
    OutboxRepository,
    OutboxRelay,
    {
      provide: SQS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new SQSClient({
          region: config.get<string>('AWS_REGION'),
          requestHandler: {
            connectionTimeout: SQS_CONNECTION_TIMEOUT_MS,
            requestTimeout: SQS_REQUEST_TIMEOUT_MS,
          },
        }),
    },
    SqsPublisher,
  ],
  exports: [OutboxRepository, OutboxRelay, SqsPublisher],
})
export class EventsModule {}
