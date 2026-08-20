import { Injectable } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  AlternativeNumberDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { InventoryService } from '../../inventory';
import { BrandsService } from '../brands';
import { ArticlesTecDoc } from './articles.tecdoc';
import { LinkedVehiclesService } from './linked-vehicles';

const ARTICLE_TTL = 24 * 60 * 60;
const SUBSTITUTES_TTL = 24 * 60 * 60;
const SUBSTITUTES_MISS_TTL = 60 * 60;

/**
 * Upper bound on the cross-references shown for a single part, so a part with
 * hundreds of them never floods the substitutes tab or the bulk inventory
 * lookup behind it.
 */
export const SUBSTITUTES_LIMIT = 20;

@Injectable()
export class ArticlesService {
  constructor(
    private readonly tecdoc: ArticlesTecDoc,
    private readonly cache: RedisCache,
    private readonly brands: BrandsService,
    private readonly inventory: InventoryService,
    private readonly linkedVehicles: LinkedVehiclesService,
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
    const articles = await this.loadArticlePage(
      vehicleId,
      categoryId,
      page,
      pageSize,
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
    const substitutes = await this.loadComparableParts(articleNumber);

    const enriched = await this.brands.attachLogos(substitutes);

    return enriched.slice(0, SUBSTITUTES_LIMIT);
  }

  /**
   * The numbers other brands sell this part under, for the alternative-numbers
   * section. Read on demand: unlike the OE numbers it sits beside, TecDoc only
   * resolves these through a comparable-number search, so no list response
   * carries them.
   *
   * The same comparable set the substitutes tab lists, projected down to number
   * and brand — one cached read serves both, so opening either surface warms
   * the other.
   */
  async getAlternativeNumbers(
    articleNumber: string,
  ): Promise<AlternativeNumberDto[]> {
    const comparable = await this.loadComparableParts(articleNumber);

    return comparable.slice(0, SUBSTITUTES_LIMIT).map((part) => ({
      articleNumber: part.articleNumber,
      brandName: part.brandName,
    }));
  }

  /**
   * Cacheable TecDoc catalog metadata for the article detail page — identity,
   * brand, images, specs, OE numbers, and vehicle fit, with **no** live
   * inventory. The page caches this and hydrates price/availability separately
   * via {@link getArticlesAvailability}, so a cached detail page never serves a
   * stale delivery date.
   */
  async getArticleDetail(
    brandId: number,
    articleNumber: string,
    vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    return this.loadCatalogDetail(brandId, articleNumber, vehicleId);
  }

  /**
   * A page of catalog rows, with each row's `legacyArticleId`s pinned on the
   * way past.
   *
   * The `includeAll` listing already carries those ids, and the
   * applicable-vehicles section needs exactly them — without this it re-reads
   * each article the first time a visitor expands a row. Warming from inside the
   * loader ties it to the TecDoc read itself, so the memos are written when the
   * page is, and the two entries then age out together.
   */
  private loadArticlePage(
    vehicleId: number,
    categoryId: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    return this.cache.cached(
      `tecdoc:articles:${vehicleId}:${categoryId}:${page}:${pageSize}`,
      ARTICLE_TTL,
      async () => {
        const catalogPage = await this.tecdoc.getArticles(
          vehicleId,
          categoryId,
          page,
          pageSize,
        );

        await this.linkedVehicles.rememberLinkageRoles(catalogPage.roles);

        return catalogPage.articles;
      },
    );
  }

  /**
   * The cached comparable-number read behind both the substitutes tab and the
   * alternative-numbers section. The shorter miss TTL keeps a part that is
   * briefly missing its cross-references from being remembered as having none
   * for a whole day.
   *
   * The searched part is dropped here rather than at the TecDoc seam: a part is
   * not its own substitute, whichever brand filed it, which is a statement about
   * the list we show and not about what the comparable-number search returns.
   */
  private loadComparableParts(
    articleNumber: string,
  ): Promise<ArticleSummaryDto[]> {
    return this.cache.cachedArray(
      `tecdoc:substitutes:${articleNumber}`,
      SUBSTITUTES_TTL,
      SUBSTITUTES_MISS_TTL,
      async () => {
        const comparable =
          await this.tecdoc.getComparableArticles(articleNumber);

        return comparable.filter(
          (part) => part.articleNumber !== articleNumber,
        );
      },
    );
  }

  /**
   * Nothing is caught here on purpose. This used to wrap the read in a
   * catch-all that reported every failure as `Article not found`, which turned a
   * TecDoc outage into a permanent-sounding 404 for a part we do in fact sell.
   * The TecDoc layer now distinguishes the two — {@link ArticleNotFoundException}
   * for a genuine miss, CATALOG_UNAVAILABLE for a failed read — so letting both
   * through unchanged is what keeps them apart.
   *
   * `vehicleId` is deliberately absent from the cache key. Nothing in the
   * payload varies by vehicle yet — `fitsVehicle` is unresolved, see the TODO
   * in `article-mapper.ts` — and keying on it stored one identical copy of a
   * popular part per vehicle a visitor happened to arrive from. Resolving fit
   * is what puts it back.
   */
  private async loadCatalogDetail(
    brandId: number,
    articleNumber: string,
    vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    const detail = await this.cache.cached(
      `tecdoc:article-detail:${brandId}:${articleNumber}`,
      ARTICLE_TTL,
      () => this.tecdoc.getArticleDetails(brandId, articleNumber, vehicleId),
    );

    const [enriched] = await this.brands.attachLogos([detail]);

    return enriched;
  }
}
