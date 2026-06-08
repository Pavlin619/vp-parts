import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './tecdoc/tecdoc-cache.service';
import { TecDocClient } from './tecdoc/tecdoc-client';
import { TecDocMockClient } from './tecdoc/tecdoc-mock-client';
import { TecDocCacheService } from './tecdoc/tecdoc-cache.service';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { InventoryModule } from '../inventory';

@Module({
  imports: [InventoryModule],
  controllers: [CatalogController],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL')!),
    },
    {
      provide: TecDocClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService): TecDocClient | TecDocMockClient =>
        config.get<string>('TECDOC_MOCK') === 'true'
          ? new TecDocMockClient()
          : new TecDocClient(config),
    },
    TecDocCacheService,
    CatalogRepository,
    CatalogService,
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
