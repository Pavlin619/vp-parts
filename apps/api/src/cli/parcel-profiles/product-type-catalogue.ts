import { ArticleIdentityDto } from '@vp-parts-shop/shared';
import { catalogLabelOf } from '../../tecdoc';
import type { PacedTecDoc } from './paced-tecdoc';

export interface ProductType {
  genericArticleId: number;
  name: string;
  articleCount: number;
}

/** A type up to this size is read whole in one call; TecDoc caps `perPage` here. */
export const SMALL_TYPE_LIMIT = 1000;
const BIG_TYPE_BRANDS = 10;
const BIG_TYPE_PAGE_SIZE = 100;

const BASE_PARAMS = { articleCountry: 'BG', lang: 'bg', page: 1 } as const;

interface ArticleReference {
  articleNumber: string;
  dataSupplierId: number;
}

interface ProductTypeFacetReply {
  genericArticleFacets?: {
    counts: {
      genericArticleId: number;
      genericArticleDescription: string;
      count: number;
    }[];
  };
}

interface BrandFacetReply {
  dataSupplierFacets?: { counts: { dataSupplierId: number; count: number }[] };
}

interface ArticleListReply {
  articles?: ArticleReference[];
}

/**
 * Which articles of which product type the brands we stock have, from TecDoc.
 * Only identities come back: the weight is looked up in our own catalogue.
 */
export class ProductTypeCatalogue {
  constructor(private readonly tecDoc: PacedTecDoc) {}

  async listProductTypes(brandIds: number[]): Promise<ProductType[]> {
    const reply = await this.tecDoc.call<ProductTypeFacetReply>('getArticles', {
      ...BASE_PARAMS,
      dataSupplierIds: brandIds,
      perPage: 0,
      includeGenericArticleFacets: true,
    });

    return (reply.genericArticleFacets?.counts ?? []).map((facet) => ({
      genericArticleId: facet.genericArticleId,
      name: catalogLabelOf(facet.genericArticleDescription),
      articleCount: facet.count,
    }));
  }

  /**
   * A big type comes back from TecDoc in blocks by brand and only its first
   * ~10,000 rows are reachable, so it is read through the brands our catalogue
   * weighs most instead. `brandWeighedCounts` ranks them.
   */
  async readArticles(
    type: ProductType,
    brandIds: number[],
    brandWeighedCounts: ReadonlyMap<number, number>,
  ): Promise<ArticleIdentityDto[]> {
    const articles =
      type.articleCount <= SMALL_TYPE_LIMIT
        ? await this.readWholeType(type, brandIds)
        : await this.readTopBrands(type, brandIds, brandWeighedCounts);

    return uniqueIdentities(articles);
  }

  private async readWholeType(
    type: ProductType,
    brandIds: number[],
  ): Promise<ArticleReference[]> {
    const reply = await this.tecDoc.call<ArticleListReply>('getArticles', {
      ...BASE_PARAMS,
      genericArticleIds: [type.genericArticleId],
      dataSupplierIds: brandIds,
      perPage: SMALL_TYPE_LIMIT,
    });

    return reply.articles ?? [];
  }

  private async readTopBrands(
    type: ProductType,
    brandIds: number[],
    brandWeighedCounts: ReadonlyMap<number, number>,
  ): Promise<ArticleReference[]> {
    const brandsWithType = await this.brandsWithType(type, brandIds);
    const topBrands = [...brandsWithType]
      .sort(
        (left, right) =>
          (brandWeighedCounts.get(right) ?? 0) -
          (brandWeighedCounts.get(left) ?? 0),
      )
      .slice(0, BIG_TYPE_BRANDS);
    const articles: ArticleReference[] = [];

    for (const brandId of topBrands) {
      const reply = await this.tecDoc.call<ArticleListReply>('getArticles', {
        ...BASE_PARAMS,
        genericArticleIds: [type.genericArticleId],
        dataSupplierIds: [brandId],
        perPage: BIG_TYPE_PAGE_SIZE,
      });
      articles.push(...(reply.articles ?? []));
    }

    return articles;
  }

  private async brandsWithType(
    type: ProductType,
    brandIds: number[],
  ): Promise<number[]> {
    const reply = await this.tecDoc.call<BrandFacetReply>('getArticles', {
      ...BASE_PARAMS,
      genericArticleIds: [type.genericArticleId],
      dataSupplierIds: brandIds,
      perPage: 0,
      includeDataSupplierFacets: true,
    });

    return (reply.dataSupplierFacets?.counts ?? []).map(
      (facet) => facet.dataSupplierId,
    );
  }
}

function uniqueIdentities(articles: ArticleReference[]): ArticleIdentityDto[] {
  const byKey = new Map<string, ArticleIdentityDto>();

  for (const { articleNumber, dataSupplierId } of articles) {
    byKey.set(`${dataSupplierId}:${articleNumber}`, {
      brandId: String(dataSupplierId),
      articleNumber,
    });
  }

  return [...byKey.values()];
}
