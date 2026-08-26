import { Injectable, Logger } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticlePartNumbersDto,
  ArticleSummaryDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../../redis';
import { InventoryService } from '../../../inventory';
import { CrossReferenceCandidate } from '../../../tecdoc';
import { BrandsService } from '../../brands';
import { ArticleReadCache } from '../article-read';
import {
  ARTICLE_DEFAULT_PAGE,
  ARTICLE_DEFAULT_PAGE_SIZE,
} from '../articles.dto';
import {
  CandidateAvailability,
  ViewedArticle,
  dropViewedPart,
  keepCandidatesCiting,
  orderByAvailability,
  pageOf,
} from './candidate-set';
import { CrossReferencesTecDoc } from './cross-references.tecdoc';

const CROSS_REFERENCE_TTL = 24 * 60 * 60;
const CROSS_REFERENCE_MISS_TTL = 60 * 60;

/** A hydrated row is TecDoc catalog data, so it ages like the rest of it. */
const ARTICLE_ROW_TTL = 24 * 60 * 60;

/**
 * Which parts replace a part, in the two shapes the frontend asks for: whole
 * rows for the substitutes section and bare numbers for the part-numbers chips.
 * Both are answered from one cached candidate set, so opening either surface
 * warms the other.
 *
 * `docs/CROSS-REFERENCES.md` is the design document — it carries the live
 * measurements behind the candidate/row split and the alternatives rejected.
 */
@Injectable()
export class CrossReferencesService {
  private readonly logger = new Logger(CrossReferencesService.name);

  constructor(
    private readonly tecdoc: CrossReferencesTecDoc,
    private readonly cache: RedisCache,
    private readonly brands: BrandsService,
    private readonly inventory: InventoryService,
    private readonly articleRead: ArticleReadCache,
  ) {}

  /**
   * One page of the parts that replace this one, ordered by what we can ship.
   *
   * The whole cross-reference set is resolved and ordered per request, and only
   * the rows on the requested page are then hydrated into renderable metadata —
   * a candidate costs under a kilobyte where a rendered row costs ten to thirty,
   * so paying for detail per page is what makes showing *all* the alternatives
   * affordable. `total` is the size of the whole set, which is what lets the
   * section offer more until they are exhausted.
   *
   * Vehicle-independent by design: if the viewed part fits the selected vehicle,
   * so does anything replacing it, so no per-substitute fit check is done. Live
   * price and availability are fetched separately by the client, as on every
   * other list surface.
   */
  async getSubstitutes(
    brandId: number,
    articleNumber: string,
    page: number = ARTICLE_DEFAULT_PAGE,
    pageSize: number = ARTICLE_DEFAULT_PAGE_SIZE,
  ): Promise<PaginatedCatalogArticlesDto> {
    const candidates = await this.loadCrossReferences(brandId, articleNumber);
    const ordered = orderByAvailability(
      candidates,
      await this.availabilityForOrdering(candidates),
    );

    const requested = pageOf(ordered, page, pageSize);
    const rows = await this.hydrateRows(requested.items);

    return { ...requested, items: await this.brands.attachLogos(rows) };
  }

  /**
   * Every number this part can be ordered by, for the numbers section: the
   * vehicle manufacturers' OE numbers and the numbers other brands sell the
   * equivalent part under.
   *
   * Both halves are read on demand rather than carried by the list surfaces —
   * the alternatives because they are only known once the cross-references
   * resolve, the OE numbers because they are the bulkiest field on an article
   * and no row renders them until this section opens.
   *
   * The two reads run together and both are cached: the alternatives need no
   * hydration at all, since number and brand are already on the candidate, and
   * the article read behind the OE numbers is the same one the cross-reference
   * resolution just warmed.
   */
  async getPartNumbers(
    brandId: number,
    articleNumber: string,
  ): Promise<ArticlePartNumbersDto> {
    const [candidates, article] = await Promise.all([
      this.loadCrossReferences(brandId, articleNumber),
      this.articleRead.read(brandId, articleNumber),
    ]);

    return {
      oemNumbers: article.detail.oemNumbers,
      alternativeNumbers: candidates.map((candidate) => ({
        articleNumber: candidate.articleNumber,
        brandName: candidate.brandName,
      })),
    };
  }

  /**
   * The cached cross-reference set behind both surfaces. The shorter miss TTL
   * keeps a part that is briefly missing its equivalents from being remembered as
   * having none for a whole day.
   *
   * Keyed on brand and number together, like every other article-scoped read:
   * which part a number means depends on who filed it, and two suppliers sharing
   * a number have different parts, hence different replacements.
   *
   * The *set* is cached and its *order* is not: the ordering is decided per
   * request from live stock, so a page-shaped entry would serve yesterday's
   * ordering. The hydrated rows are cached separately, one per row.
   */
  private loadCrossReferences(
    brandId: number,
    articleNumber: string,
  ): Promise<CrossReferenceCandidate[]> {
    return this.cache.cachedArray(
      `tecdoc:crossrefs:${brandId}:${articleNumber}`,
      CROSS_REFERENCE_TTL,
      CROSS_REFERENCE_MISS_TTL,
      () => this.resolveCrossReferences(brandId, articleNumber),
    );
  }

  /**
   * Resolves which parts replace this one: the cross-reference index, filtered to
   * the rows that actually cite this part.
   *
   * The search is narrowed to the viewed part's own generic article, which is why
   * a part TecDoc files none for gets an empty list rather than an unnarrowed
   * search. A short list, or an empty one, is a legitimate answer — a wrong
   * substitute is a part a mechanic fits to the wrong car, and how many suppliers
   * cite a brand is a property of the data rather than something to make up for.
   */
  private async resolveCrossReferences(
    brandId: number,
    articleNumber: string,
  ): Promise<CrossReferenceCandidate[]> {
    const { genericArticleIds } = await this.articleRead.read(
      brandId,
      articleNumber,
    );
    const genericArticleId = genericArticleIds[0];

    if (genericArticleId === undefined) {
      return [];
    }

    const viewed: ViewedArticle = { brandId: String(brandId), articleNumber };
    const candidates = await this.tecdoc.getCrossReferenceCandidates(
      articleNumber,
      genericArticleId,
    );

    return dropViewedPart(keepCandidatesCiting(candidates, viewed), viewed);
  }

  /**
   * Live availability for every candidate, for the ordering step alone.
   *
   * `getAvailability` fails closed everywhere else, and this is the one caller
   * that must not: a stock-database outage has to cost the cross-reference list
   * its *ordering*, not its existence. The rows' own prices are fetched by the
   * client through the live availability endpoint, which keeps failing closed, so
   * no buy box ever renders a guess because of this catch.
   */
  private async availabilityForOrdering(
    candidates: CrossReferenceCandidate[],
  ): Promise<CandidateAvailability> {
    if (candidates.length === 0) {
      return null;
    }

    const articles = candidates.map((candidate) => ({
      brandId: candidate.brandId,
      articleNumber: candidate.articleNumber,
    }));

    try {
      return await this.inventory.getAvailability(articles);
    } catch (error) {
      this.logger.warn(
        `Ordering ${articles.length} cross-reference(s) by catalogue data: ` +
          `availability unavailable (${describe(error)})`,
      );

      return null;
    }
  }

  /**
   * Turns the candidates on one page into rows a list can render.
   *
   * Cached per row rather than per page, because the ordering is live: a
   * page-number key would serve yesterday's ordering, and an id-set key would
   * miss whenever stock moved a row across a page boundary. Per-row entries also
   * mean a part appearing in two different lists is fetched once.
   */
  private hydrateRows(
    candidates: CrossReferenceCandidate[],
  ): Promise<ArticleSummaryDto[]> {
    return this.cache.cachedMany<CrossReferenceCandidate, ArticleSummaryDto>({
      items: candidates,
      ttl: ARTICLE_ROW_TTL,
      keyOf: articleRowKey,
      keyOfLoaded: articleRowKey,
      loadMissing: (missing) =>
        this.tecdoc.getArticleRowsByLegacyIds(hydrationIdsOf(missing)),
    });
  }
}

function articleRowKey(article: {
  brandId: string;
  articleNumber: string;
}): string {
  return `tecdoc:article-row:${article.brandId}:${article.articleNumber}`;
}

/**
 * One hydration id per candidate. A part catalogued in two roles carries one id
 * per role, and both resolve to the same article, so the second would buy a
 * duplicate row.
 */
function hydrationIdsOf(candidates: CrossReferenceCandidate[]): number[] {
  return candidates
    .map((candidate) => candidate.legacyArticleIds[0])
    .filter(
      (legacyArticleId): legacyArticleId is number =>
        legacyArticleId !== undefined,
    );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
