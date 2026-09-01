import { Injectable } from '@nestjs/common';
import {
  PaginatedCatalogArticlesDto,
  ArticlePartNumbersDto,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../../redis';
import { CrossReferenceCandidate } from '../../../tecdoc';
import { BrandsService } from '../../brands';
import { ArticleOrderCache, ArticleRowsCache, pageOf } from '../article-list';
import { ArticleReadCache } from '../article-read';
import {
  ARTICLE_DEFAULT_PAGE,
  ARTICLE_DEFAULT_PAGE_SIZE,
} from '../articles.dto';
import {
  ViewedArticle,
  dropViewedPart,
  keepCandidatesCiting,
} from './candidate-set';
import { CrossReferencesTecDoc } from './cross-references.tecdoc';

const CROSS_REFERENCE_TTL = 24 * 60 * 60;
const CROSS_REFERENCE_MISS_TTL = 60 * 60;

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
  constructor(
    private readonly tecdoc: CrossReferencesTecDoc,
    private readonly cache: RedisCache,
    private readonly brands: BrandsService,
    private readonly articleRead: ArticleReadCache,
    private readonly order: ArticleOrderCache,
    private readonly rows: ArticleRowsCache,
  ) {}

  /**
   * One page of the parts that replace this one, ordered by what we can ship.
   *
   * The whole cross-reference set is resolved and ordered before a page is cut
   * from it, and only the rows on that page are then hydrated into renderable
   * metadata — a candidate costs under a kilobyte where a rendered row costs ten
   * to thirty, so paying for detail per page is what makes showing *all* the
   * alternatives affordable. `total` is the size of the whole set, which is what
   * lets the section offer more until they are exhausted.
   *
   * The ordering is pinned for the length of a paging session, because this
   * section pages by appending: re-ranked against a later stock read, "show
   * more" would append a row the visitor is already looking at and silently drop
   * another. {@link ArticleOrderCache} holds it.
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
    const ordered = await this.order.ordered(
      crossReferenceOrderKey(brandId, articleNumber),
      candidates,
    );

    const requested = pageOf(ordered, page, pageSize);
    const rows = await this.rows.hydrate(requested.items);

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
   * The set is cached whole and unordered, for a day. Its ordering is a separate,
   * far shorter entry because it is decided from live stock, and the hydrated
   * rows are a third, one per row — three lifetimes, because catalogue data,
   * what we can ship, and a rendered row all go stale at different rates.
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
}

/**
 * Page-free, like the key the set itself is cached under: the ordering is a
 * property of the whole set, so one entry serves every page of it.
 */
function crossReferenceOrderKey(
  brandId: number,
  articleNumber: string,
): string {
  return `crossrefs:order:${brandId}:${articleNumber}`;
}
