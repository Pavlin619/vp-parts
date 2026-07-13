import { Module } from '@nestjs/common';
import { TecDocTransport } from './tecdoc-transport';
import { TecDocMockClient } from './tecdoc-mock-client';

/**
 * Shared, reusable TecDoc plumbing: the JSON-RPC HTTP transport and the single
 * in-memory mock. Every feature module (catalog vehicles/articles/brands,
 * search) imports this and binds its own TecDoc source to either the real
 * transport-backed class or the shared {@link TecDocMockClient} when
 * `TECDOC_MOCK=true`. Redis caching lives in the generic `RedisModule`.
 */
@Module({
  providers: [TecDocTransport, TecDocMockClient],
  exports: [TecDocTransport, TecDocMockClient],
})
export class TecDocModule {}
