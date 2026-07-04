import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AuthModule } from './auth';
import { CommonModule } from './common';
import { PrismaModule } from './prisma';
import { CatalogModule } from './catalog';
import { InventoryModule } from './inventory';
import { SearchModule } from './search';
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
        // Direct (non-pooled) connection used only by Prisma CLI/migrations,
        // which need session-level features that PgBouncer transaction mode
        // breaks. Not read by the runtime app; optional so local/CI without a
        // pooler fall back to DATABASE_URL (see prisma.config.ts).
        DIRECT_URL: Joi.string().optional(),
        REDIS_URL: Joi.string().required(),

        CLERK_PUBLISHABLE_KEY: Joi.string().required(),
        CLERK_SECRET_KEY: Joi.string().required(),
        CLERK_WEBHOOK_SECRET: Joi.string().required(),

        INTERNAL_API_TOKEN: Joi.string().required(),

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

        SEARCH_BRAND_DICTIONARY: Joi.string().optional(),

        RESEND_API_KEY: Joi.string().required(),
        EMAIL_FROM: Joi.string().email().required(),

        COD_MAX_ORDER_TOTAL_CENTS: Joi.number()
          .integer()
          .positive()
          .default(20000),
        VAT_RATE: Joi.number().min(0).max(1).default(0.2),
        CORS_ORIGIN: Joi.string().default('http://localhost:3000'),

        // Delivery scheduling (see DeliveryScheduleService + docs/DELIVERY-LOGIC.md).
        SHOP_TIMEZONE: Joi.string().default('Europe/Sofia'),
        SHOP_HOURS_WEEKDAY_OPEN: Joi.number()
          .integer()
          .min(0)
          .max(23)
          .default(9),
        SHOP_HOURS_WEEKDAY_CLOSE: Joi.number()
          .integer()
          .min(0)
          .max(24)
          .default(18),
        SHOP_HOURS_SATURDAY_OPEN: Joi.number()
          .integer()
          .min(0)
          .max(23)
          .default(9),
        SHOP_HOURS_SATURDAY_CLOSE: Joi.number()
          .integer()
          .min(0)
          .max(24)
          .default(14),
        SAME_DAY_CUTOFF_HOUR: Joi.number().integer().min(0).max(23).default(11),
        NEXT_DAY_PLUS_CUTOFF_HOUR: Joi.number()
          .integer()
          .min(0)
          .max(23)
          .default(17),
        WITHIN_HOUR_OFFSET_MINUTES: Joi.number().integer().min(0).default(60),
        COURIER_EXTRA_WORKING_DAYS: Joi.number().integer().min(0).default(1),
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
    PrismaModule,
    CatalogModule,
    InventoryModule,
    SearchModule,
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
