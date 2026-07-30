import { Injectable, Logger } from '@nestjs/common';
import {
  BrandDto,
  PaginatedSearchArticlesDto,
  SearchFacetDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { TtlMemo } from '../../common';
import { BrandsTecDoc } from './brands.tecdoc';

const BRAND_TTL = 7 * 24 * 60 * 60;

/**
 * How long a derived brand lookup is held in process memory. Far shorter than
 * the Redis entry it is built from, so it never widens the staleness we already
 * accept — it only stops every request re-reading and re-parsing the same list.
 * Shared with the search brand dictionary, which derives from the same read.
 */
export const BRAND_MEMO_TTL_MS = 10 * 60 * 1000;

/** Kept short: brands rarely change, but a stuck lookup should not last. */
export const BRAND_MEMO_RETRY_AFTER_MS = 30 * 1000;

/**
 * Reusable brand feature: the Redis-cached TecDoc data-supplier list plus the
 * brand-name -> logo join every list surface (catalog listing, article detail,
 * substitutes) and the search facets need. TecDoc keys articles by brand name
 * but returns logos only from `getBrands`, so the two are joined here by brand
 * name. This is a synchronous read-enrichment dependency other features inject
 * via the brands barrel.
 */
@Injectable()
export class BrandsService {
  private readonly logger = new Logger(BrandsService.name);

  private readonly logoMap = new TtlMemo({
    name: 'Brand logos',
    ttlMs: BRAND_MEMO_TTL_MS,
    retryAfterMs: BRAND_MEMO_RETRY_AFTER_MS,
    load: async () => toLogoMap(await this.getBrands()),
  });

  constructor(
    private readonly tecdoc: BrandsTecDoc,
    private readonly cache: RedisCache,
  ) {}

  /**
   * Parts brands (TecDoc data suppliers) with their logos, Redis-cached. Search
   * uses this as the source for its brand-token dictionary; it is the same data
   * the listing layer joins for brand logos.
   */
  async getBrands(): Promise<BrandDto[]> {
    return this.cache.cached('tecdoc:brands:all', BRAND_TTL, () =>
      this.tecdoc.getBrands(),
    );
  }

  /**
   * The brand-name -> logo lookup used to enrich both article rows and the
   * brand search facet, memoised in process on top of the Redis-cached read.
   *
   * Never throws. A logo is decoration on a catalogue response the caller has
   * already paid for, and every consumer already renders `brandLogoUrl: null`
   * for a brand it has no logo on file for — so an unavailable brand list
   * degrades to that rather than failing the listing, detail or search request
   * it was only decorating.
   */
  async getBrandLogoMap(): Promise<Map<string, string | null>> {
    try {
      return await this.logoMap.get();
    } catch {
      this.logger.warn('Brand logos unavailable; rendering rows without one');

      return new Map();
    }
  }

  /**
   * Joins brand logos onto a batch of article rows by brand name for every list
   * and detail surface. A row whose brand has no logo on file keeps
   * `brandLogoUrl: null`. Skips the (cached) getBrands read entirely for an
   * empty batch so an empty search or substitutes result never triggers it.
   */
  async attachLogos<
    T extends { brandName: string; brandLogoUrl: string | null },
  >(items: T[]): Promise<T[]> {
    if (items.length === 0) {
      return items;
    }

    const logoByBrand = await this.getBrandLogoMap();

    return items.map((item) => ({
      ...item,
      brandLogoUrl: logoByBrand.get(item.brandName) ?? null,
    }));
  }

  /**
   * Joins logos onto a search result's article rows AND its brand facet values
   * from a single (cached) getBrands read. A fully empty result skips the read
   * so a hopeless search never fetches the brand list. The search facet group
   * is brand-only (categories ride on the category navigation, technical
   * attributes on their own facets — neither carries a logo).
   */
  async applyLogosToSearchResults(
    results: PaginatedSearchArticlesDto,
  ): Promise<PaginatedSearchArticlesDto> {
    const isEmpty =
      results.items.length === 0 &&
      results.facets.length === 0 &&
      results.attributes.length === 0 &&
      results.categoryNavigation.options.length === 0 &&
      results.categoryNavigation.current === null;
    if (isEmpty) {
      return results;
    }

    const logoByBrand = await this.getBrandLogoMap();

    const items = results.items.map((item) => ({
      ...item,
      brandLogoUrl: logoByBrand.get(item.brandName) ?? null,
    }));
    const facets = this.attachFacetLogos(results.facets, logoByBrand);

    return { ...results, items, facets };
  }

  private attachFacetLogos(
    facets: SearchFacetDto[],
    logoByBrand: Map<string, string | null>,
  ): SearchFacetDto[] {
    return facets.map((facet) => ({
      ...facet,
      values: facet.values.map((value) => ({
        ...value,
        imageUrl: logoByBrand.get(value.label) ?? null,
      })),
    }));
  }
}

function toLogoMap(brands: BrandDto[]): Map<string, string | null> {
  return new Map(brands.map((brand) => [brand.brandName, brand.logoUrl]));
}
