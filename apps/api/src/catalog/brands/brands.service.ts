import { Injectable } from '@nestjs/common';
import {
  ArticleSummaryDto,
  BrandDto,
  SearchFacetDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../redis';
import { BrandsTecDoc } from './brands.tecdoc';

const BRAND_TTL = 7 * 24 * 60 * 60;

/** The two halves of a search response that carry a brand logo. */
interface SearchLogoJoin {
  items: ArticleSummaryDto[];
  facets: SearchFacetDto[];
}

/**
 * Reusable brand feature: the Redis-cached TecDoc data-supplier list plus the
 * brand -> logo join every list surface (catalog listing, article detail,
 * substitutes) and the search facets need. `getArticles` carries no logo and
 * `getBrands` carries nothing else, so the two are joined here on the
 * `dataSupplierId` both sides key on. This is a synchronous read-enrichment
 * dependency other features inject via the brands barrel.
 */
@Injectable()
export class BrandsService {
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
   * The brand-id -> logo lookup used to enrich both article rows and the brand
   * search facet. Backed by the (cached) getBrands read. Keyed on
   * `dataSupplierId` rather than the display name, which is neither unique nor
   * stable across TecDoc data releases.
   */
  async getBrandLogoMap(): Promise<Map<string, string | null>> {
    const brands = await this.getBrands();

    return new Map(brands.map((brand) => [brand.brandId, brand.logoUrl]));
  }

  /**
   * Joins brand logos onto a batch of article rows for every list and detail
   * surface. A row whose brand has no logo on file keeps `brandLogoUrl: null`.
   * Skips the (cached) getBrands read entirely for an empty batch so an empty
   * search or substitutes result never triggers it.
   */
  async attachLogos<T extends { brandId: string; brandLogoUrl: string | null }>(
    items: T[],
  ): Promise<T[]> {
    if (items.length === 0) {
      return items;
    }

    const logoByBrand = await this.getBrandLogoMap();

    return items.map((item) => ({
      ...item,
      brandLogoUrl: logoByBrand.get(item.brandId) ?? null,
    }));
  }

  /**
   * Joins logos onto a search result's article rows AND its brand facet values
   * from a single (cached) getBrands read. A result with neither skips the read
   * so a hopeless search never fetches the brand list. Brands are the only
   * facet with a logo — product types have none, categories ride on the
   * category navigation and technical attributes on their own facets.
   *
   * Takes the two pieces rather than the response, because they come from two
   * different reads: the rows from whichever order the page was served in, the
   * facets from the enumeration of the whole match set.
   */
  async attachSearchLogos(results: SearchLogoJoin): Promise<SearchLogoJoin> {
    const { items, facets } = results;

    if (items.length === 0 && facets.length === 0) {
      return { items, facets };
    }

    const logoByBrand = await this.getBrandLogoMap();

    return {
      items: items.map((item) => ({
        ...item,
        brandLogoUrl: logoByBrand.get(item.brandId) ?? null,
      })),
      facets: this.attachFacetLogos(facets, logoByBrand),
    };
  }

  /**
   * Only the brand group is touched. Its value ids are `dataSupplierId`s, so
   * they key the logo map directly — but ids are only unique within a facet,
   * and a product type whose `genericArticleId` happens to equal some
   * `dataSupplierId` would otherwise be given that brand's logo.
   */
  private attachFacetLogos(
    facets: SearchFacetDto[],
    logoByBrand: Map<string, string | null>,
  ): SearchFacetDto[] {
    return facets.map((facet) =>
      facet.id === 'brands'
        ? {
            ...facet,
            values: facet.values.map((value) => ({
              ...value,
              imageUrl: logoByBrand.get(value.id) ?? null,
            })),
          }
        : facet,
    );
  }
}
