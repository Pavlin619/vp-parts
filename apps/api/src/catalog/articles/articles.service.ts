import { Injectable } from '@nestjs/common';
import {
  ArticleCatalogDetailDto,
  ArticleIdentityDto,
  ArticlesAvailabilityDto,
} from '@vp-parts-shop/shared';
import { InventoryService } from '../../inventory';
import { BrandsService } from '../brands';
import { ArticleReadCache } from './article-read';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly brands: BrandsService,
    private readonly inventory: InventoryService,
    private readonly articleRead: ArticleReadCache,
  ) {}

  /**
   * Live price/availability for a batch of articles, keyed by brand and number.
   * This is the single, uncached availability read behind every list surface —
   * search and substitutes both hydrate their cached metadata with it
   * client-side. It fails closed: a DB read error throws
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
