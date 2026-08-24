import { Injectable } from '@nestjs/common';
import { RedisCache } from '../../redis';
import { ArticleDetailRead } from '../../tecdoc';
import { ArticlesTecDoc } from './articles.tecdoc';

/** TecDoc catalog data for one article moves only on a data release. */
const ARTICLE_READ_TTL = 24 * 60 * 60;

/**
 * The cached single-article TecDoc read, shared by the detail page and the
 * cross-reference resolution — which needs the same response's generic article,
 * so opening the substitutes tab on a page already rendered costs only the
 * cross-reference search itself.
 *
 * A provider of its own rather than a private method on either caller, so that
 * one class owns the `tecdoc:article-read:*` namespace. Two callers building the
 * key themselves could drift apart with nothing failing — each would simply
 * stop seeing the other's entries and pay for its own read.
 */
@Injectable()
export class ArticleReadCache {
  constructor(
    private readonly tecdoc: ArticlesTecDoc,
    private readonly cache: RedisCache,
  ) {}

  /**
   * `vehicleId` is deliberately absent from the cache key. Nothing in the payload
   * varies by vehicle yet — `fitsVehicle` is unresolved, see the TODO in
   * `article-mapper.ts` — and keying on it stored one identical copy of a popular
   * part per vehicle a visitor happened to arrive from. Resolving fit is what puts
   * it back.
   */
  read(
    brandId: number,
    articleNumber: string,
    vehicleId?: number,
  ): Promise<ArticleDetailRead> {
    return this.cache.cached(
      `tecdoc:article-read:${brandId}:${articleNumber}`,
      ARTICLE_READ_TTL,
      () => this.tecdoc.getArticleDetails(brandId, articleNumber, vehicleId),
    );
  }
}
