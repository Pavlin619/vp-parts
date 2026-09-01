import { Module } from '@nestjs/common';
import { TecDocModule, tecDocSourceProvider } from '../../../tecdoc';
import { RedisModule } from '../../../redis';
import { InventoryModule } from '../../../inventory';
import { ArticleRowsTecDoc } from './article-rows.tecdoc';
import { ArticleRowsCache } from './article-rows.cache';
import { ArticleOrderCache } from './article-order.cache';

/**
 * Reusable machinery for any surface that reads a whole article set and renders
 * one page of it: the ranked order and its pin, the hydration read and its
 * per-row cache. Consumed by the cross-reference lists and by search.
 *
 * The ordering rule itself and the paging cut are pure functions and need no
 * provider — they come out of the same barrel.
 */
@Module({
  imports: [TecDocModule, RedisModule, InventoryModule],
  providers: [
    tecDocSourceProvider(ArticleRowsTecDoc),
    ArticleRowsCache,
    ArticleOrderCache,
  ],
  exports: [ArticleRowsCache, ArticleOrderCache],
})
export class ArticleListModule {}
