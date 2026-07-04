import { Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
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

/**
 * Closes the shared Redis connection when the Nest app shuts down. Without this
 * the socket (and its reconnection timer) keeps the event loop alive, which
 * hangs `app.close()` — the reason the e2e suite previously needed `--forceExit`.
 * `disconnect()` is used over `quit()` so teardown never blocks on an in-flight
 * command or an unreachable server.
 */
@Injectable()
export class RedisConnectionLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

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
    RedisConnectionLifecycle,
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
