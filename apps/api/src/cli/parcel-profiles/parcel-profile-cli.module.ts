import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { ProductTypeParcelProfileRepository } from '../../cart';
import { InventoryModule } from '../../inventory';
import { PrismaModule } from '../../prisma';
import { TecDocModule } from '../../tecdoc';
import { ParcelProfileBuilder } from './parcel-profile-builder';
import { StockedBrandsRepository } from './stocked-brands.repository';

/** Only what the builder needs, so the run does not demand the web API's Clerk, SQS or payment settings. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required(),
        TECDOC_API_KEY: Joi.string().required(),
        TECDOC_BASE_URL: Joi.string().uri().required(),
        TECDOC_PROVIDER_ID: Joi.number().integer().positive().optional(),
        TECDOC_TIMEOUT_MS: Joi.number().integer().positive().default(10000),
      }),
    }),
    PrismaModule,
    TecDocModule,
    InventoryModule,
  ],
  providers: [
    ParcelProfileBuilder,
    StockedBrandsRepository,
    ProductTypeParcelProfileRepository,
  ],
})
export class ParcelProfileCliModule {}
