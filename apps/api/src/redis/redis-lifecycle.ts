import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis-cache';

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
