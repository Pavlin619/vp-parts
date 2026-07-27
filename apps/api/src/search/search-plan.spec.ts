import { buildSearchPlan, requestFor } from './search-plan';
import { SearchMode } from './search-types';

const PART = { type: 10, matchType: 'prefix_or_suffix' } as const;
const EXACT = { type: 10, matchType: 'exact' } as const;
const TERM = { type: 99 } as const;

function parsed(raw: string, brandStripped = raw) {
  return { raw, brandStripped };
}

describe('buildSearchPlan', () => {
  describe('generic mode', () => {
    it('plans a single free-text call over the raw query', () => {
      expect(
        buildSearchPlan(parsed('oil filter bosch'), SearchMode.Generic),
      ).toEqual([{ query: 'oil filter bosch', execution: TERM }]);
    });

    it('ignores brand stripping — the raw query is the free-text query', () => {
      expect(
        buildSearchPlan(parsed('WA5432 WIX', 'WA5432'), SearchMode.Generic),
      ).toEqual([{ query: 'WA5432 WIX', execution: TERM }]);
    });
  });

  describe('exact mode', () => {
    it('plans a single exact call over the raw query with no fallback', () => {
      expect(
        buildSearchPlan(
          parsed('WA5432 WIX', 'WA5432'),
          SearchMode.PartNumberExact,
        ),
      ).toEqual([{ query: 'WA5432 WIX', execution: EXACT }]);
    });
  });

  describe('part-number mode (default)', () => {
    it('plans one step when no brand token was stripped', () => {
      expect(buildSearchPlan(parsed('WL6340'), SearchMode.PartNumber)).toEqual([
        { query: 'WL6340', execution: PART },
      ]);
    });

    // The stripped token may itself have been part of the number, so the raw
    // query stays in the plan as the second lane.
    it('plans the stripped query first, then the raw one, when they differ', () => {
      expect(
        buildSearchPlan(parsed('WA5432 WIX', 'WA5432'), SearchMode.PartNumber),
      ).toEqual([
        { query: 'WA5432', execution: PART },
        { query: 'WA5432 WIX', execution: PART },
      ]);
    });

    it('never plans a free-text fallback', () => {
      const plan = buildSearchPlan(
        parsed('oil filter', 'oil filter'),
        SearchMode.PartNumber,
      );

      expect(plan.map((step) => step.execution)).not.toContainEqual(TERM);
    });
  });
});

describe('requestFor', () => {
  it('combines a plan step with a scope into one request', () => {
    const scope = {
      vehicleId: 10042,
      page: 2,
      pageSize: 20,
      filters: { brandIds: [4] },
    };

    expect(requestFor({ query: 'WL6340', execution: PART }, scope)).toEqual({
      query: 'WL6340',
      execution: PART,
      vehicleId: 10042,
      page: 2,
      pageSize: 20,
      filters: { brandIds: [4] },
    });
  });
});
