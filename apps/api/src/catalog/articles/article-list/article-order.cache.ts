import { Injectable } from '@nestjs/common';
import {
  ArticleIdentityDto,
  articleIdentityKey,
  stockScopesOf,
} from '@vp-parts-shop/shared';
import { RedisCache } from '../../../redis';
import { InventoryService } from '../../../inventory';
import {
  OrderableArticle,
  OrderingAvailability,
  orderByAvailability,
} from './article-ordering';
import { HydratableArticle } from './article-rows.cache';
import { ScopedArticle } from './stock-scope-selection';

/**
 * How long a ranked set stays pinned: long enough to page through a list, short
 * enough that the order and the stock badges drawn on it cannot visibly
 * diverge. Deliberately a fraction of the TTLs on the sets themselves — those
 * are TecDoc catalogue data and age slowly, while what we can ship changes by
 * the minute.
 */
const ARTICLE_ORDER_TTL = 5 * 60;

/** An article a list can both rank and later hydrate a row for. */
export type RankableArticle = OrderableArticle & HydratableArticle;

/**
 * An article in a pinned order: enough to hydrate its row, plus which stock
 * origins could ship it at the instant the order was ranked.
 *
 * Those origins are a by-product, not a second read. Ranking already resolves
 * every warehouse behind every candidate — see `deliverySpeed` in
 * {@link orderByAvailability} — and used to discard it. Keeping two bits of it
 * is what lets a list be counted and narrowed by origin for free, and pairs
 * those numbers with the same snapshot the row *positions* came from. Reading
 * stock again instead would answer a fresher question than the order beneath it.
 */
export type OrderedArticle = HydratableArticle & ScopedArticle;

/**
 * The order a ranked article set is served in, pinned for the length of a paging
 * session.
 *
 * Ranking is live — what we can ship is the one thing in a list that changes by
 * the minute, and reading it costs a single batched query, 1.7 ms for 500
 * identities. That is also exactly why the *result* has to be held: page 2
 * ranked against a stock read a minute after page 1 is not page 2 of the same
 * list. A part whose last unit sold in between drops a place, so the visitor
 * sees the row above it twice and the row below it never.
 *
 * The stored order carries identities alone, so nothing a row renders is served
 * from a five-minute-old copy of TecDoc data — {@link HydratableArticle} is
 * everything the row cache needs to fetch the rest.
 *
 * Every list surface pins under its own key and shares these rules, because
 * "which part do we show first" and "for how long does that answer hold" are one
 * decision: a surface answering the first without the second re-ranks under the
 * visitor mid-page.
 */
@Injectable()
export class ArticleOrderCache {
  constructor(
    private readonly cache: RedisCache,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * The whole set in the order it is served in, ranked now or read back from the
   * ranking an earlier page was cut from.
   *
   * A ranking made without stock is not pinned. It is already deterministic from
   * catalogue data alone, so paging needs no help from us, and pinning it would
   * hold a degraded order for minutes after the stock database came back. This
   * is the one caller of `getAvailabilityForOrdering`, the only fail-soft
   * availability read — everywhere else an outage must fail closed.
   */
  async ordered(
    key: string,
    candidates: RankableArticle[],
  ): Promise<OrderedArticle[]> {
    const pinned = await this.cache.readMemo<OrderedArticle[]>(key);

    if (pinned !== undefined) {
      return pinned;
    }

    const availability = await this.inventory.getAvailabilityForOrdering(
      identitiesOf(candidates),
    );

    const ordered = orderByAvailability(candidates, availability).map(
      (candidate) => orderedOf(candidate, availability),
    );

    if (availability !== null) {
      await this.cache.writeMemo(key, ordered, ARTICLE_ORDER_TTL);
    }

    return ordered;
  }
}

function identitiesOf(candidates: RankableArticle[]): ArticleIdentityDto[] {
  return candidates.map((candidate) => ({
    brandId: candidate.brandId,
    articleNumber: candidate.articleNumber,
  }));
}

/**
 * Keyed off the availability read as a whole, not off the entry for this
 * article: a successful read reports a part nobody stocks by having no
 * warehouses, so an empty origin list is the answer there — while a failed read
 * has to leave the origins unknown for every article in the set.
 */
function orderedOf(
  candidate: RankableArticle,
  availability: OrderingAvailability,
): OrderedArticle {
  const hydratable = {
    brandId: candidate.brandId,
    articleNumber: candidate.articleNumber,
    legacyArticleIds: candidate.legacyArticleIds,
  };

  if (availability === null) {
    return hydratable;
  }

  const key = articleIdentityKey(candidate.brandId, candidate.articleNumber);
  const warehouses = availability.get(key)?.availabilityByWarehouse ?? [];

  return { ...hydratable, stockScopes: stockScopesOf(warehouses) };
}
