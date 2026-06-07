import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AuthModule } from './auth';
import { CommonModule } from './common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(3002),

        DATABASE_URL: Joi.string().required(),
        REDIS_URL: Joi.string().required(),

        CLERK_PUBLISHABLE_KEY: Joi.string().required(),
        CLERK_SECRET_KEY: Joi.string().required(),
        CLERK_WEBHOOK_SECRET: Joi.string().required(),

        INTERNAL_API_TOKEN: Joi.string().required(),
        BACKOFFICE_BASE_URL: Joi.string().uri().required(),

        AWS_REGION: Joi.string().default('eu-central-1'),
        SQS_FULFILLMENT_QUEUE_URL: Joi.string().uri().required(),
        SQS_EVENTS_QUEUE_URL: Joi.string().uri().required(),

        MYPOS_STORE_ID: Joi.string().required(),
        MYPOS_API_KEY: Joi.string().required(),
        MYPOS_WALLET_NUMBER: Joi.string().required(),

        ECONT_USERNAME: Joi.string().required(),
        ECONT_PASSWORD: Joi.string().required(),

        SPEEDY_USERNAME: Joi.string().required(),
        SPEEDY_PASSWORD: Joi.string().required(),

        TECDOC_API_KEY: Joi.string().required(),
        TECDOC_BASE_URL: Joi.string().uri().required(),

        RESEND_API_KEY: Joi.string().required(),
        EMAIL_FROM: Joi.string().email().required(),

        COD_MAX_ORDER_TOTAL_CENTS: Joi.number()
          .integer()
          .positive()
          .default(20000),
        VAT_RATE: Joi.number().min(0).max(1).default(0.2),
        CORS_ORIGIN: Joi.string().default('http://localhost:3000'),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    CommonModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
