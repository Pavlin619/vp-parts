import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DOMINAITE_CLIENT, createDominaiteClient } from './dominaite.client';
import { DominaiteGateway } from './dominaite.gateway';
import { DominaiteWebhooks } from './dominaite-webhooks';

@Module({
  providers: [
    {
      provide: DOMINAITE_CLIENT,
      useFactory: createDominaiteClient,
      inject: [ConfigService],
    },
    DominaiteGateway,
    DominaiteWebhooks,
  ],
  exports: [DominaiteGateway, DominaiteWebhooks],
})
export class PaymentsModule {}
