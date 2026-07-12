import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ManufacturerDto,
  ModelSeriesDto,
  VehicleVariantDto,
  AssemblyGroupDto,
  BrandDto,
  PaginatedCatalogArticlesDto,
  PaginatedSearchArticlesDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  ArticlesAvailabilityDto,
  AutocompleteItemDto,
} from '@vp-parts-shop/shared';
import { CatalogRepository } from './catalog.repository';
import {
  SearchExecution,
  SearchFilters,
  SUBSTITUTES_LIMIT,
} from './tecdoc/tecdoc-client';
import { InventoryService } from '../inventory';

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
   * Cacheable TecDoc catalog metadata for a search hit — identity, brand,
   * description, thumbnail, and (when a vehicle is scoped) fit — with **no**
   * live inventory. Search is a pure catalog read now: the client fetches live
   * price/availability separately via {@link getArticlesAvailability} and
   * merges it in, mirroring the listing grid / article detail split. Keeping
   * inventory out of the search path means a search never triggers a stock-DB
   * read per TecDoc tier attempt. The brand facet, technical-attribute facets,
   * and single-level category navigation (with active `filters` applied) ride
   * along on the result for the UI to narrow a broad query. Results keep TecDoc's
   * native order — no client-side ranking.
   */
  async searchArticles(
    query: string,
    vehicleId?: string,
    execution?: SearchExecution,
    page = 1,
    pageSize = 50,
    filters?: SearchFilters,
  ): Promise<PaginatedSearchArticlesDto> {
    return this.repository.searchArticles(
      query,
      vehicleId,
      execution,
      page,
      pageSize,
      filters,
    );
  }

  /**
   * Parts brands (TecDoc data suppliers) with their logos, Redis-cached. Search
   * uses this as the source for its brand-token dictionary (see the search
   * module); it is the same data the listing layer joins for brand logos.
   */
  async getBrands(): Promise<BrandDto[]> {
    return this.repository.findBrands();
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
  async getSubstitutes(articleNumber: string): Promise<ArticleSummaryDto[]> {
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
}
