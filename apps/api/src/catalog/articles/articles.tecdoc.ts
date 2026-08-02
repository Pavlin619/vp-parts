import { Injectable, Logger } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticleCatalogDetailDto,
  ArticleSummaryDto,
  LinkedVehicleDto,
} from '@vp-parts-shop/shared';
import {
  LinkageTargetType,
  TecDocTransport,
  TecDocArticleLinkagesResponse,
  TecDocArticleRecord,
  TecDocLinkageTargetRecord,
  collectLinkedTargetIds,
  mapArticleSummary,
  mapLinkedVehicle,
} from '../../tecdoc';
import { ArticleNotFoundException } from './article-not-found.exception';

/**
 * Upper bound on comparable (cross-reference) articles fetched and returned for
 * a single part. Caps the TecDoc `getArticles` page size and the enriched list
 * so a part with hundreds of cross-references never floods the substitutes tab
 * or the bulk inventory lookup behind it.
 */
export const SUBSTITUTES_LIMIT = 20;

/**
 * A `getArticles` response for the two lookups that resolve one specific
 * article. `totalMatchingArticles` counts the whole match, not the page, which
 * is what lets {@link ArticlesTecDoc.requireArticle} notice an ambiguous answer
 * while still asking for a single row.
 */
interface ArticleLookupResponse {
  totalMatchingArticles?: number;
  articles?: TecDocArticleRecord[];
}

/**
 * TecDoc source for the article surfaces: the per-vehicle+category listing, the
 * single-article detail, and the comparable-number (cross-reference)
 * substitutes list. All are `getArticles` (`includeAll`) calls that differ only
 * in how the articles are selected; the shared {@link mapArticleSummary} maps
 * each row.
 *
 * The two reads that resolve one specific part take a `brandId` (TecDoc's
 * `dataSupplierId`) alongside the number, because a number on its own is not an
 * identity — see {@link articleLookupPayload}.
 */
@Injectable()
export class ArticlesTecDoc {
  private readonly logger = new Logger(ArticlesTecDoc.name);

  constructor(private readonly transport: TecDocTransport) {}

  async getArticles(
    vehicleId: number,
    categoryId: number,
    page: number,
    pageSize: number,
  ): Promise<PaginatedCatalogArticlesDto> {
    const data = await this.transport.call<{
      totalMatchingArticles: number;
      // Absent, not empty, when nothing matches — TecDoc omits the collection.
      articles?: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      assemblyGroupNodeIds: categoryId,
      linkageTargetType: LinkageTargetType.Vehicle,
      linkageTargetId: vehicleId,
      perPage: pageSize,
      page,
      includeAll: true,
    });

    return {
      total: data.totalMatchingArticles,
      page,
      pageSize,
      items: (data.articles ?? []).map((article) => mapArticleSummary(article)),
    };
  }

  async getArticleDetails(
    brandId: number,
    articleNumber: string,
    // Reserved for the future per-vehicle fit lookup; fit is null until then.
    _vehicleId?: number,
  ): Promise<ArticleCatalogDetailDto> {
    const data = await this.transport.call<ArticleLookupResponse>(
      'getArticles',
      {
        ...this.articleLookupPayload(brandId, articleNumber),
        includeAll: true,
      },
    );

    const article = this.requireArticle(data, articleNumber);

    return {
      // The row summary (identity, brand, description, thumbnail, specs, OE)
      // is shared with every list surface; the detail adds the image gallery.
      ...mapArticleSummary(article),
      images: (article.images ?? [])
        .map((img) => img.imageURL800 ?? '')
        .filter(Boolean),
      // Compatible vehicles cost three further reads, and the detail page
      // fetches that section on demand instead.
      compatibleVehicles: [],
    };
  }

  /**
   * Comparable (cross-reference) articles for a part — "the same part from
   * other data suppliers". Uses `getArticles` with `searchType: 3` (Comparable
   * Number, per the Pegasus 3.0 Onboarding Guide §8.5). The searched article is
   * excluded and duplicates are removed; the page size is capped at
   * {@link SUBSTITUTES_LIMIT}.
   *
   * Keyed on the number alone, unlike the two lookups above. `dataSupplierIds`
   * filters the *results*, not the search input, and TecDoc offers no way to
   * say "comparable to this number as filed by this brand" — so sending a brand
   * here would narrow the answer to the one brand we already have, which is the
   * opposite of a cross-reference list.
   *
   * TODO(substitutes-precision): consider passing `genericArticleIds` (taken
   * from the viewed article's `genericArticles`) to keep a cross-reference for a
   * different *kind* of part out of the list. Needs checking against real
   * TecDoc data first: generic articles are granular enough ("Oil Filter" vs
   * "Oil Filter Set") that a legitimate substitute filed one node over would
   * silently vanish, and a missing substitute is far harder to spot than a
   * wrong one. Diff the result sets with and without it before enabling.
   */
  async getSubstitutes(articleNumber: string): Promise<ArticleSummaryDto[]> {
    const data = await this.transport.call<{
      articles?: TecDocArticleRecord[];
    }>('getArticles', {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: articleNumber,
      searchType: 3,
      searchMatchType: 'exact',
      perPage: SUBSTITUTES_LIMIT,
      page: 1,
      includeAll: true,
    });

    // Identity is brand + number, so two suppliers answering with the same
    // number are two cross-references, not a repeat. Deduping on the number
    // alone dropped the second one.
    const seen = new Set<string>();
    const substitutes: ArticleSummaryDto[] = [];

    for (const article of data.articles ?? []) {
      // The viewed part is not its own substitute, whichever brand filed it.
      if (article.articleNumber === articleNumber) continue;

      const identity = `${article.dataSupplierId}:${article.articleNumber}`;
      if (seen.has(identity)) continue;
      seen.add(identity);

      substitutes.push(mapArticleSummary(article));
    }

    return substitutes;
  }

  /**
   * The `legacyArticleId`s an article number resolves to — the only ids
   * {@link getLinkedTargetIds} accepts. TecDoc files one per article/generic-
   * article pair rather than one per part, so a part catalogued in two roles
   * (an oil filter that is also part of a filter set) carries two, with its
   * vehicle linkages split across both.
   *
   * Only the pairs TecDoc marks as having vehicle links are returned, so a part
   * whose second role is axle- or engine-linked costs no extra lookup. An
   * unknown number is a genuine miss rather than a failed read, so it surfaces
   * as {@link ArticleNotFoundException} — the same verdict
   * {@link getArticleDetails} reaches for the same input. A known part with no
   * vehicle-linked role is a different answer: an empty list.
   */
  async getLegacyArticleIds(
    brandId: number,
    articleNumber: string,
  ): Promise<number[]> {
    const data = await this.transport.call<ArticleLookupResponse>(
      'getArticles',
      {
        ...this.articleLookupPayload(brandId, articleNumber),
        includeGenericArticles: true,
      },
    );

    const article = this.requireArticle(data, articleNumber);

    return (article.genericArticles ?? [])
      .filter((genericArticle) => hasVehicleLinkages(genericArticle))
      .map((genericArticle) => genericArticle.legacyArticleId)
      .filter((articleId): articleId is number => articleId !== undefined);
  }

  /**
   * The ids of the vehicles one `legacyArticleId` is linked to. Ids and nothing
   * else — {@link getLinkageTargets} is what turns them into vehicles. The call
   * takes no page parameters and always answers with every linkage on file, so
   * capping is the caller's job.
   *
   * Note the singular `linkingTargetType`: this function predates the
   * `linkageTarget*` naming the rest of the catalog uses, and silently ignores
   * the other spelling rather than rejecting it.
   */
  async getLinkedTargetIds(legacyArticleId: number): Promise<number[]> {
    const data = await this.transport.call<TecDocArticleLinkagesResponse>(
      'getArticleLinkedAllLinkingTarget4',
      {
        articleCountry: 'BG',
        lang: 'bg',
        articleId: legacyArticleId,
        linkingTargetType: LinkageTargetType.Vehicle,
      },
    );

    return collectLinkedTargetIds(data);
  }

  /** Turns bare linkage target ids into the rows the section renders. */
  async getLinkageTargets(targetIds: number[]): Promise<LinkedVehicleDto[]> {
    const data = await this.transport.call<{
      linkageTargets?: TecDocLinkageTargetRecord[];
    }>('getLinkageTargets', {
      linkageTargetCountry: 'BG',
      lang: 'bg',
      linkageTargetType: LinkageTargetType.Vehicle,
      linkageTargetIds: targetIds.map((id) => ({
        type: LinkageTargetType.Vehicle,
        id,
      })),
      perPage: targetIds.length,
      page: 1,
    });

    return (data.linkageTargets ?? []).map(mapLinkedVehicle);
  }

  /**
   * The shared `getArticles` request for resolving one specific article.
   *
   * `dataSupplierIds` is what makes the lookup an identity rather than a guess:
   * an article number is unique only within a data supplier, so without it
   * TecDoc answers with every supplier filing that number and the first row
   * wins by accident. `searchMatchType` is the documented default, sent
   * explicitly because a lookup that quietly became a prefix match would
   * resolve to a different part altogether.
   */
  private articleLookupPayload(brandId: number, articleNumber: string) {
    return {
      articleCountry: 'BG',
      lang: 'bg',
      searchQuery: articleNumber,
      searchType: 0,
      searchMatchType: 'exact',
      dataSupplierIds: [brandId],
      // One row, because brand + exact number is meant to match exactly one and
      // these records are heavy (gallery, criteria, OE numbers). A wider page
      // would only be paid for on every read to discard the surplus; the count
      // below reports ambiguity for free.
      perPage: 1,
      page: 1,
    };
  }

  /**
   * The article a brand-scoped exact-number lookup found, or a 404.
   *
   * TecDoc answers a lookup that matched nothing with an absent collection
   * rather than an error, so without this an unknown number would read as an
   * article with undefined everything instead of {@link
   * ArticleNotFoundException}.
   *
   * The warning covers the one case brand + number cannot: a supplier filing
   * the number under two of its own brands. Nothing here can tell which is
   * meant, so the row stands as returned — the log exists only to say whether
   * that case is real, since it would otherwise show a wrong part in silence.
   */
  private requireArticle(
    data: ArticleLookupResponse,
    articleNumber: string,
  ): TecDocArticleRecord {
    const article = data.articles?.[0];

    if (!article) {
      throw new ArticleNotFoundException();
    }

    if ((data.totalMatchingArticles ?? 1) > 1) {
      this.logger.warn(
        `Ambiguous lookup for article ${articleNumber} from data supplier ` +
          `${article.dataSupplierId}: ${data.totalMatchingArticles} records ` +
          'match. Using the first TecDoc returned.',
      );
    }

    return article;
  }
}

/**
 * Whether a generic-article pair has vehicle links worth looking up. TecDoc
 * only lists the families it actually holds links for, so a pair that omits
 * vehicles would answer the linkage lookup with nothing. A pair that lists no
 * families at all is kept: absent is TecDoc not saying, not TecDoc saying no.
 */
function hasVehicleLinkages(genericArticle: {
  linkageTargetTypes?: LinkageTargetType[];
}): boolean {
  const { linkageTargetTypes } = genericArticle;

  return (
    linkageTargetTypes === undefined ||
    linkageTargetTypes.includes(LinkageTargetType.Vehicle)
  );
}
