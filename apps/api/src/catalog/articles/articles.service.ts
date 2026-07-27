import { Injectable } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { InventoryService } from '../../inventory';
import { BrandsService } from '../brands';
import { ArticlesTecDoc, SUBSTITUTES_LIMIT } from './articles.tecdoc';

const ARTICLE_TTL = 24 * 60 * 60;
const SUBSTITUTES_TTL = 24 * 60 * 60;
const SUBSTITUTES_MISS_TTL = 60 * 60;

@Injectable()
export class ArticlesService {
  constructor(
    private readonly tecdoc: ArticlesTecDoc,
    private readonly cache: RedisCache,
    private readonly brands: BrandsService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Cacheable catalog metadata for a category page — article identity, brand,
   * description, and thumbnail, with **no** live inventory. The grid caches this
   * (stable TecDoc data) and hydrates it with fresh price/availability via
   * {@link getArticlesAvailability}, mirroring the article detail page's
   * cached-metadata / live-availability split. Keeping inventory out of the
   * cached payload is what lets us never serve a stale delivery date.
   */
  async listArticleMetadata(
    vehicleId: number,
    categoryId: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    const articles = await this.cache.cached(
      `tecdoc:articles:${vehicleId}:${categoryId}:${page}:${pageSize}`,
      ARTICLE_TTL,
      () => this.tecdoc.getArticles(vehicleId, categoryId, page, pageSize),
    );

    const items = await this.brands.attachLogos(articles.items);

    return { ...articles, items };
  }

  /**
   * Live price/availability for a batch of article numbers, keyed by number.
   * This is the single, uncached availability read behind every list surface —
   * the catalog grid, search, and substitutes all hydrate their cached metadata
   * with it client-side. It fails closed: a DB read error throws
   * InventoryUnavailableException so a whole list never renders as falsely out
   * of stock.
   */
  async getArticlesAvailability(
    articleNumbers: string[],
  ): Promise<ArticlesAvailabilityDto> {
    const detailByNumber = await this.inventory.getAvailability(articleNumbers);

    const availability: ArticlesAvailabilityDto = {};
    for (const [articleNumber, detail] of detailByNumber) {
      availability[articleNumber] = detail;
    }

    return availability;
  }

  /**
   * Cross-reference substitutes for an article — the same part from other
   * brands (TecDoc comparable numbers), as cacheable catalog metadata only.
   * Live price/availability is fetched separately via
   * {@link getArticlesAvailability}, mirroring the listing grid's
   * metadata / live-availability split. Vehicle-independent by design: if the
   * viewed part fits the selected vehicle, its comparables fit too, so no
   * per-substitute fit check is done. Capped at {@link SUBSTITUTES_LIMIT}.
   */
  async getSubstitutes(articleNumber: string): Promise<ArticleSummaryDto[]> {
    const substitutes = await this.cache.cachedArray(
      `tecdoc:substitutes:${articleNumber}`,
      SUBSTITUTES_TTL,
      SUBSTITUTES_MISS_TTL,
      () => this.tecdoc.getSubstitutes(articleNumber),
    );

    const enriched = await this.brands.attachLogos(substitutes);

    return enriched.slice(0, SUBSTITUTES_LIMIT);
  }

  /**
   * Cacheable TecDoc catalog metadata for the article detail page — identity,
   * brand, images, specs, OE numbers, and vehicle fit, with **no** live
   * inventory. The page caches this and hydrates price/availability separately
   * via {@link getArticlesAvailability}, so a cached detail page never serves a
   * stale delivery date.
   */
  async getArticleDetail(
    articleNumber: string,
    vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    return this.loadCatalogDetail(articleNumber, vehicleId);
  }

  /**
   * Nothing is caught here on purpose. This used to wrap the read in a
   * catch-all that reported every failure as `Article not found`, which turned a
   * TecDoc outage into a permanent-sounding 404 for a part we do in fact sell.
   * The TecDoc layer now distinguishes the two — {@link ArticleNotFoundException}
   * for a genuine miss, CATALOG_UNAVAILABLE for a failed read — so letting both
   * through unchanged is what keeps them apart.
   */
  private async loadCatalogDetail(
    articleNumber: string,
    vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    const detail = await this.cache.cached(
      `tecdoc:article-detail:${articleNumber}:${vehicleId ?? 'none'}`,
      ARTICLE_TTL,
      () => this.tecdoc.getArticleDetails(articleNumber, vehicleId),
    );

    const [enriched] = await this.brands.attachLogos([detail]);

    return enriched;
  }
}
