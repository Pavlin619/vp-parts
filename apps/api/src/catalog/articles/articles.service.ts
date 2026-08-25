import { Injectable } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleIdentityDto,
  ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { InventoryService } from '../../inventory';
import { BrandsService } from '../brands';
import { ArticleReadCache } from './article-read';
import {
  ARTICLE_DEFAULT_PAGE,
  ARTICLE_DEFAULT_PAGE_SIZE,
} from './articles.dto';
import { ArticlesTecDoc } from './articles.tecdoc';
import { LinkedVehiclesService } from './linked-vehicles';

/** A listing page is TecDoc catalog data, which moves on a data release. */
const ARTICLE_PAGE_TTL = 24 * 60 * 60;

@Injectable()
export class ArticlesService {
  constructor(
    private readonly tecdoc: ArticlesTecDoc,
    private readonly cache: RedisCache,
    private readonly brands: BrandsService,
    private readonly inventory: InventoryService,
    private readonly linkedVehicles: LinkedVehiclesService,
    private readonly articleRead: ArticleReadCache,
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
    page: number = ARTICLE_DEFAULT_PAGE,
    pageSize: number = ARTICLE_DEFAULT_PAGE_SIZE,
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
   * Live price/availability for a batch of articles, keyed by brand and number.
   * This is the single, uncached availability read behind every list surface —
   * the catalog grid, search, and substitutes all hydrate their cached metadata
   * with it client-side. It fails closed: a DB read error throws
   * InventoryUnavailableException so a whole list never renders as falsely out
   * of stock.
   */
  async getArticlesAvailability(
    articles: ArticleIdentityDto[],
  ): Promise<ArticlesAvailabilityDto> {
    const detailByArticle = await this.inventory.getAvailability(articles);

    const availability: ArticlesAvailabilityDto = {};
    for (const [key, detail] of detailByArticle) {
      availability[key] = detail;
    }

    return availability;
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
      ARTICLE_PAGE_TTL,
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
   * Nothing is caught here on purpose. This used to wrap the read in a
   * catch-all that reported every failure as `Article not found`, which turned a
   * TecDoc outage into a permanent-sounding 404 for a part we do in fact sell.
   * The TecDoc layer now distinguishes the two — {@link ArticleNotFoundException}
   * for a genuine miss, CATALOG_UNAVAILABLE for a failed read — so letting both
   * through unchanged is what keeps them apart.
   */
  private async loadCatalogDetail(
    brandId: number,
    articleNumber: string,
    vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    const { detail } = await this.articleRead.read(
      brandId,
      articleNumber,
      vehicleId,
    );

    const [enriched] = await this.brands.attachLogos([detail]);

    return enriched;
  }
}
