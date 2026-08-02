import { Injectable } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  AlternativeNumberDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
  LinkedVehicleDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { InventoryService } from '../../inventory';
import { BrandsService } from '../brands';
import { ArticlesTecDoc, SUBSTITUTES_LIMIT } from './articles.tecdoc';

const ARTICLE_TTL = 24 * 60 * 60;
const SUBSTITUTES_TTL = 24 * 60 * 60;
const SUBSTITUTES_MISS_TTL = 60 * 60;
const LINKED_VEHICLES_TTL = 24 * 60 * 60;
const LINKED_VEHICLES_MISS_TTL = 60 * 60;
const LEGACY_ARTICLE_IDS_TTL = 24 * 60 * 60;

/**
 * Upper bound on the vehicles listed for one article. A common service part
 * fits into the thousands of modifications; the section is a browsing tool, not
 * a data export. TecDoc's linkage lookup takes no page parameters and always
 * answers in full, so the cap is applied to the ids it returns — only that many
 * are then hydrated into rows.
 */
export const LINKED_VEHICLES_LIMIT = 200;

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
   * The vehicles an article fits, for the applicable-vehicles section. Read on
   * demand — the section is behind a click on every surface that offers it, and
   * a common service part carries far more linkages than the row it expands.
   *
   * Pure TecDoc data with no inventory in it, so it caches like the rest of the
   * catalog metadata; the shorter miss TTL keeps a part that is briefly missing
   * its linkages from being remembered as vehicle-less for a whole day.
   */
  async getLinkedVehicles(
    brandId: number,
    articleNumber: string,
  ): Promise<LinkedVehicleDto[]> {
    return this.cache.cachedArray(
      `tecdoc:linked-vehicles:${brandId}:${articleNumber}`,
      LINKED_VEHICLES_TTL,
      LINKED_VEHICLES_MISS_TTL,
      () => this.loadLinkedVehicles(brandId, articleNumber),
    );
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
   * TecDoc splits the applicable-vehicles answer three ways, so this assembles
   * it: our surfaces hold the article number a customer reads off a part, the
   * linkage lookup is keyed by `legacyArticleId` and answers with bare target
   * ids, and only the linkage-target read knows what those ids are called.
   */
  private async loadLinkedVehicles(
    brandId: number,
    articleNumber: string,
  ): Promise<LinkedVehicleDto[]> {
    const targetIds = await this.collectLinkedTargetIds(brandId, articleNumber);

    if (targetIds.length === 0) {
      return [];
    }

    return this.tecdoc.getLinkageTargets(targetIds);
  }

  /**
   * Every vehicle the article is linked to, across all its generic-article
   * roles. The roles are read in parallel and merged because TecDoc files
   * linkages per role, and the sets overlap wherever a vehicle takes the part
   * in more than one — hence the dedupe before the cap.
   */
  private async collectLinkedTargetIds(
    brandId: number,
    articleNumber: string,
  ): Promise<number[]> {
    const legacyArticleIds = await this.resolveLegacyArticleIds(
      brandId,
      articleNumber,
    );

    const targetIdsPerRole = await Promise.all(
      legacyArticleIds.map((legacyArticleId) =>
        this.tecdoc.getLinkedTargetIds(legacyArticleId),
      ),
    );

    const merged = new Set(targetIdsPerRole.flat());

    return [...merged].slice(0, LINKED_VEHICLES_LIMIT);
  }

  /**
   * The article number → `legacyArticleId` lookup, memoised because the mapping
   * only moves when TecDoc ships a data release. Only a resolved number is
   * written: an unknown one throws before the cache is touched, so a part
   * TecDoc adds tomorrow is not remembered as missing.
   */
  private resolveLegacyArticleIds(
    brandId: number,
    articleNumber: string,
  ): Promise<number[]> {
    return this.cache.cached(
      `tecdoc:article-legacy-ids:${brandId}:${articleNumber}`,
      LEGACY_ARTICLE_IDS_TTL,
      () => this.tecdoc.getLegacyArticleIds(brandId, articleNumber),
    );
  }

  /**
   * The cached TecDoc comparable-number read behind both the substitutes tab
   * and the alternative-numbers section. The shorter miss TTL keeps a part that
   * is briefly missing its cross-references from being remembered as having
   * none for a whole day.
   */
  private loadComparableParts(
    articleNumber: string,
  ): Promise<ArticleSummaryDto[]> {
    return this.cache.cachedArray(
      `tecdoc:substitutes:${articleNumber}`,
      SUBSTITUTES_TTL,
      SUBSTITUTES_MISS_TTL,
      () => this.tecdoc.getSubstitutes(articleNumber),
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
    const detail = await this.cache.cached(
      `tecdoc:article-detail:${brandId}:${articleNumber}:${vehicleId ?? 'none'}`,
      ARTICLE_TTL,
      () => this.tecdoc.getArticleDetails(brandId, articleNumber, vehicleId),
    );

    const [enriched] = await this.brands.attachLogos([detail]);

    return enriched;
  }
}
