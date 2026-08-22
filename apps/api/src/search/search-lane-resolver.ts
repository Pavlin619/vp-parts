import { Injectable } from '@nestjs/common';
import { PaginatedSearchArticlesDto } from '@vp-parts-shop/shared';
import { hasActiveFilters, SearchFilters } from './search-types';
import { requestFor, SearchPlanStep, SearchScope } from './search-plan';
import { laneCacheKey, laneToken } from './search-cache-keys';
import { SearchCache } from './search-cache';
import { SEARCH_DEFAULT_PAGE, SEARCH_DEFAULT_PAGE_SIZE } from './search.dto';

/**
 * The one request the lane probe ever makes: the unnarrowed first page. Fixing
 * it is what makes the winning lane a property of the query alone — the
 * caller's filters and page can never influence which lane wins — and it is the
 * page every user loads before they can filter or paginate, so it is also the
 * warmest key in the search cache.
 */
const LANE_PROBE_PAGE = SEARCH_DEFAULT_PAGE;
const LANE_PROBE_PAGE_SIZE = SEARCH_DEFAULT_PAGE_SIZE;
const LANE_PROBE_FILTERS: SearchFilters = Object.freeze({});

/**
 * The outcome of probing a plan: the step that produced a non-empty total — the
 * "lane" — or `null` when every step came back empty, plus the probe page it
 * returned so an unnarrowed first-page request needs no second call.
 */
interface ResolvedSearch {
  result: PaginatedSearchArticlesDto;
  lane: SearchPlanStep | null;
}

/**
 * Picks which of a multi-step plan's TecDoc calls actually answers a query, and
 * runs the caller's page against it.
 *
 * Only a `part_number` search whose brand token was stripped yields more than
 * one step. Those first resolve which lane the query belongs to and then run
 * that one lane — never the whole plan — for the caller's page and filters.
 */
@Injectable()
export class SearchLaneResolver {
  constructor(private readonly cache: SearchCache) {}

  /**
   * Runs a search plan and returns the page the caller asked for.
   *
   * A single-step plan has no lane to choose, so it goes straight to TecDoc.
   *
   * Resolving before narrowing is what keeps a filtered search honest. Filters
   * apply to every step, so a plan run with them would fall through a
   * legitimately emptied lane and answer from the other one, with facets
   * recomputed over a result set the user never saw. Resolving first makes an
   * emptied lane stay empty, which is the truthful answer for facets the user
   * picked from that lane.
   */
  async execute(
    plan: SearchPlanStep[],
    scope: SearchScope,
  ): Promise<PaginatedSearchArticlesDto> {
    if (plan.length === 1) {
      return this.runStep(plan[0], scope);
    }

    const { lane, result } = await this.resolveLane(plan, scope.vehicleId);

    if (this.isLaneProbe(scope)) {
      return result;
    }

    return this.runStep(lane ?? plan[0], scope);
  }

  /**
   * Decides which lane the query belongs to by running the plan over the
   * {@link LANE_PROBE_PAGE} request until a step reports a non-empty total.
   * Because the probe is always unnarrowed, the answer depends on the query and
   * the vehicle scope alone — never on the caller's filters, and never on
   * whether Redis happens to hold a memo.
   *
   * The memo is therefore only an ordering hint: it moves the lane that won
   * last time to the front so the probe stops on its first step and the losing
   * call is never made. That makes the probe cheaper, never wrong — a lane that
   * has since gone empty simply loses again and the memo is rewritten. Pinning
   * it is still worth doing because the losing step is cached under a short
   * miss-TTL, so without the memo that call would come back every few minutes.
   */
  private async resolveLane(
    plan: SearchPlanStep[],
    vehicleId: number | undefined,
  ): Promise<ResolvedSearch> {
    const key = laneCacheKey(plan, vehicleId);
    const pinnedToken = await this.cache.readLane(key);

    const probe = await this.probePlan(
      this.pinnedFirst(plan, pinnedToken),
      vehicleId,
    );

    const winningToken = probe.lane ? laneToken(probe.lane) : undefined;
    if (winningToken !== undefined && winningToken !== pinnedToken) {
      await this.cache.writeLane(key, winningToken);
    }

    return probe;
  }

  /**
   * The plan reordered to try the memoised lane first. A memo left over from a
   * plan that no longer exists — a changed brand dictionary, a different mode —
   * matches no step and leaves the order untouched.
   */
  private pinnedFirst(
    plan: SearchPlanStep[],
    pinnedToken: string | undefined,
  ): SearchPlanStep[] {
    if (pinnedToken === undefined) {
      return plan;
    }

    const isPinned = (step: SearchPlanStep): boolean =>
      laneToken(step) === pinnedToken;

    return [
      ...plan.filter(isPinned),
      ...plan.filter((step) => !isPinned(step)),
    ];
  }

  /**
   * Runs each planned TecDoc call over the probe request in order until one
   * returns a non-empty total, and reports which step that was. When a
   * vehicleId is given every call is scoped to it, so a lane that only matches
   * outside the selected vehicle correctly loses. The winning step's total,
   * facets, attributes and category navigation are authoritative for the whole
   * match set and are stable across pages.
   */
  private async probePlan(
    plan: SearchPlanStep[],
    vehicleId: number | undefined,
  ): Promise<ResolvedSearch> {
    const probeScope = this.probeScope(vehicleId);
    let lastResult = this.emptyProbePage();

    for (const step of plan) {
      const result = await this.runStep(step, probeScope);

      if (result.total > 0) {
        return { result, lane: step };
      }

      lastResult = result;
    }

    return { result: lastResult, lane: null };
  }

  /**
   * Whether the caller asked for exactly the page the probe already fetched, in
   * which case the probe's result is the answer and no second call is needed.
   * A bare `categoryHasChildren` hint does not disqualify it: the hint changes
   * nothing about the TecDoc request without a category to describe.
   */
  private isLaneProbe(scope: SearchScope): boolean {
    return (
      scope.page === LANE_PROBE_PAGE &&
      scope.pageSize === LANE_PROBE_PAGE_SIZE &&
      !hasActiveFilters(scope.filters)
    );
  }

  private probeScope(vehicleId: number | undefined): SearchScope {
    return {
      vehicleId,
      page: LANE_PROBE_PAGE,
      pageSize: LANE_PROBE_PAGE_SIZE,
      filters: LANE_PROBE_FILTERS,
    };
  }

  private runStep(
    step: SearchPlanStep,
    scope: SearchScope,
  ): Promise<PaginatedSearchArticlesDto> {
    return this.cache.searchArticles(requestFor(step, scope));
  }

  private emptyProbePage(): PaginatedSearchArticlesDto {
    return {
      total: 0,
      page: LANE_PROBE_PAGE,
      pageSize: LANE_PROBE_PAGE_SIZE,
      maxPage: 0,
      items: [],
      facets: [],
      attributes: [],
      categoryNavigation: { current: null, ancestors: [], options: [] },
    };
  }
}
