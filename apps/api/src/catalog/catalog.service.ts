import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleCatalogListItemDto,
  ArticleInventoryDetailDto,
  ArticleListItemDto,
  ArticlesAvailabilityDto,
  AutocompleteItemDto,
} from '@vp-parts-shop/shared';
import { CatalogRepository } from './catalog.repository';
import { SearchMatchType, SUBSTITUTES_LIMIT } from './tecdoc/tecdoc-client';
import { InventoryService, PriceAndAvailability } from '../inventory';

/** Neutral detail for a requested article the availability read had no row for. */
const UNAVAILABLE_DETAIL: ArticleInventoryDetailDto = {
  available: false,
  bestPriceExVat: null,
  bestPriceIncVat: null,
  availabilityByWarehouse: [],
  computedAt: null,
};

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private readonly repository: CatalogRepository,
    private readonly inventory: InventoryService,
  ) {}

  async getManufacturers(): Promise<ManufacturerDto[]> {
    return this.repository.findManufacturers();
  }

  async getModelSeries(manufacturerId: string): Promise<ModelSeriesDto[]> {
    return this.repository.findModelSeries(manufacturerId);
  }

  async getVehicleVariants(seriesId: string): Promise<VehicleVariantDto[]> {
    return this.repository.findVehicleVariants(seriesId);
  }

  async getCategoryTree(vehicleId: string): Promise<AssemblyGroupDto[]> {
    return this.repository.findAssemblyGroupTree(vehicleId);
  }

  /**
   * Cacheable catalog metadata for a category page — article identity, brand,
   * description, and thumbnail, with **no** live inventory. The grid caches this
   * (stable TecDoc data) and hydrates it with fresh price/availability via
   * {@link getArticlesAvailability}, mirroring the article detail page's
   * cached-metadata / live-availability split. Keeping inventory out of the
   * cached payload is what lets us never serve a stale delivery date.
   */
  async listArticleMetadata(
    vehicleId: string,
    categoryId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    return this.repository.findArticles(vehicleId, categoryId, page, pageSize);
  }

  /**
   * Live price/availability for a batch of article numbers, keyed by number.
   * This is the single, uncached availability read every list surface uses —
   * the catalog grid hydrates its cached metadata with it, and search /
   * substitutes enrich through it (see {@link enrichWithAvailability}). It fails
   * closed: a DB read error throws InventoryUnavailableException so a whole list
   * never renders as falsely out of stock.
   */
  async getArticlesAvailability(
    articleNumbers: string[],
  ): Promise<ArticlesAvailabilityDto> {
    const priceMap = await this.inventory.getAvailability(articleNumbers);

    const availability: ArticlesAvailabilityDto = {};
    for (const [articleNumber, inv] of priceMap) {
      availability[articleNumber] = this.toInventoryDetail(inv);
    }

    return availability;
  }

  async searchArticles(
    query: string,
    vehicleId?: string,
    matchType?: SearchMatchType,
  ): Promise<ArticleListItemDto[]> {
    const results = await this.repository.searchArticles(
      query,
      vehicleId,
      matchType,
    );
    return this.enrichWithAvailability(results);
  }

  async getAutocompleteSuggestions(
    query: string,
  ): Promise<AutocompleteItemDto[]> {
    return this.repository.findAutocompleteSuggestions(query);
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
  async getSubstitutes(
    articleNumber: string,
  ): Promise<ArticleCatalogListItemDto[]> {
    const substitutes = await this.repository.findSubstitutes(articleNumber);

    return substitutes.slice(0, SUBSTITUTES_LIMIT);
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
    vehicleId?: string,
  ): Promise<ArticleCatalogDetailDto> {
    return this.loadCatalogDetail(articleNumber, vehicleId);
  }

  private async loadCatalogDetail(
    articleNumber: string,
    vehicleId?: string,
  ): Promise<ArticleCatalogDetailDto> {
    try {
      return await this.repository.findArticleDetails(articleNumber, vehicleId);
    } catch {
      this.logger.warn(`Article not found: ${articleNumber}`);
      throw new NotFoundException(`Article not found: ${articleNumber}`);
    }
  }

  /**
   * The single enrichment path for dynamic (uncached) list surfaces — search
   * and substitutes. Attaches the full live inventory detail (price +
   * per-warehouse availability) to each catalog item so they feed the same row
   * component the grid does. The cached catalog grid does not use this; it
   * fetches {@link getArticlesAvailability} separately to keep request-time
   * delivery dates out of its cached payload.
   */
  private async enrichWithAvailability(
    items: ArticleCatalogListItemDto[],
  ): Promise<ArticleListItemDto[]> {
    if (items.length === 0) return [];

    const availability = await this.getArticlesAvailability(
      items.map((item) => item.articleNumber),
    );

    return items.map((item) => ({
      ...item,
      ...(availability[item.articleNumber] ?? UNAVAILABLE_DETAIL),
    }));
  }

  private toInventoryDetail(
    inv: PriceAndAvailability,
  ): ArticleInventoryDetailDto {
    return {
      available: inv.available,
      bestPriceExVat: inv.priceExVat,
      bestPriceIncVat: inv.priceIncVat,
      availabilityByWarehouse: inv.availabilityByWarehouse,
      computedAt: inv.computedAt,
    };
  }
}
