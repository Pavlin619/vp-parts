import { searchCallFor, requestFor } from './search-call';
import { SearchMode } from './search-types';

const PART = { type: 10, matchType: 'prefix_or_suffix' } as const;
const EXACT = { type: 10, matchType: 'exact' } as const;
const TERM = { type: 99 } as const;

function parsed(raw: string, brandStripped = raw) {
  return { raw, brandStripped };
}

describe('searchCallFor', () => {
  describe('generic mode', () => {
    it('makes a free-text call over the raw query', () => {
      expect(
        searchCallFor(parsed('oil filter bosch'), SearchMode.Generic),
      ).toEqual({ query: 'oil filter bosch', execution: TERM });
    });

    it('ignores brand stripping — the raw query is the free-text query', () => {
      expect(
        searchCallFor(parsed('WA5432 WIX', 'WA5432'), SearchMode.Generic),
      ).toEqual({ query: 'WA5432 WIX', execution: TERM });
    });
  });

  describe('exact mode', () => {
    it('makes an exact call over the raw query, unrewritten', () => {
      expect(
        searchCallFor(
          parsed('WA5432 WIX', 'WA5432'),
          SearchMode.PartNumberExact,
        ),
      ).toEqual({ query: 'WA5432 WIX', execution: EXACT });
    });
  });

  describe('part-number mode (default)', () => {
    it('searches the query as typed when no brand token was stripped', () => {
      expect(searchCallFor(parsed('WL6340'), SearchMode.PartNumber)).toEqual({
        query: 'WL6340',
        execution: PART,
      });
    });

    it('searches the brand-stripped query, and only that', () => {
      expect(
        searchCallFor(parsed('WA5432 WIX', 'WA5432'), SearchMode.PartNumber),
      ).toEqual({ query: 'WA5432', execution: PART });
    });

    it('never falls back to free text', () => {
      const call = searchCallFor(
        parsed('oil filter', 'oil filter'),
        SearchMode.PartNumber,
      );

      expect(call.execution).not.toEqual(TERM);
    });
  });
});

describe('requestFor', () => {
  it('combines a call with a scope into one request', () => {
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
