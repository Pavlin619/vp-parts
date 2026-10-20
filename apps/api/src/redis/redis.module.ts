import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisCache } from './redis-cache';
import { RedisConnectionLifecycle } from './redis-lifecycle';
import { RedisThrottlerStorage } from './redis-throttler-storage';

/**
 * Owns the shared Redis connection and the read-through {@link RedisCache}
 * helper. It is intentionally generic — any feature module that needs caching
 * imports this rather than reaching through a domain module. The connection is
 * a singleton across every importer, and {@link RedisConnectionLifecycle} tears
 * it down on shutdown.
 */
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>('REDIS_URL')!),
    },
    RedisConnectionLifecycle,
    RedisCache,
    RedisThrottlerStorage,
  ],
  exports: [REDIS_CLIENT, RedisCache, RedisThrottlerStorage],
})
export class RedisModule {}
