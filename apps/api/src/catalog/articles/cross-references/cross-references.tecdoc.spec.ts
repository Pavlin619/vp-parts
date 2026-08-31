import { Logger } from '@nestjs/common';
import { TecDocTransport } from '../../../tecdoc';
import {
  CANDIDATE_LIMIT,
  COMPARABLE_NUMBER_SEARCH_TYPE,
  CrossReferencesTecDoc,
} from './cross-references.tecdoc';

const BOSCH = 30;
const BRAKE_DISC = 82;

/** A hydration answer: the display fields a rendered row is read with. */
function record(articleNumber: string) {
  return {
    articleNumber,
    dataSupplierId: BOSCH,
    mfrName: 'Bosch',
    genericArticles: [
      {
        genericArticleId: BRAKE_DISC,
        genericArticleDescription: 'Part',
        legacyArticleId: 555,
      },
    ],
    images: [{ imageURL800: `https://img/${articleNumber}.jpg` }],
  };
}

/** A cross-reference candidate row: light includes only, plus provenance. */
function candidateRecord(
  articleNumber: string,
  overrides: {
    dataSupplierId?: number;
    citedBrandId?: number;
    articleStatusId?: number;
  } = {},
) {
  const {
    dataSupplierId = 101,
    citedBrandId = BOSCH,
    articleStatusId = 1,
  } = overrides;

  return {
    articleNumber,
    dataSupplierId,
    mfrName: 'Ferodo',
    genericArticles: [
      {
        genericArticleId: BRAKE_DISC,
        genericArticleDescription: 'Спирачен диск',
        legacyArticleId: 777,
      },
    ],
    comparableNumbers: [
      { articleNumber: 'BD-1', dataSupplierId: citedBrandId },
    ],
    misc: { articleStatusId },
  };
}

describe('CrossReferencesTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: CrossReferencesTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new CrossReferencesTecDoc({ call } as unknown as TecDocTransport);
  });

  describe('getCrossReferenceCandidates', () => {
    it('searches the comparable-number index, narrowed to the part’s own type', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [candidateRecord('DF4074')],
      });

      await tecdoc.getCrossReferenceCandidates('BD-1', BRAKE_DISC);

      expect(call).toHaveBeenCalledWith('getArticles', {
        articleCountry: 'BG',
        lang: 'bg',
        searchQuery: 'BD-1',
        searchType: COMPARABLE_NUMBER_SEARCH_TYPE,
        searchMatchType: 'exact',
        genericArticleIds: [BRAKE_DISC],
        perPage: CANDIDATE_LIMIT,
        page: 1,
        includeGenericArticles: true,
        includeComparableNumbers: true,
        includeMisc: true,
      });
    });

    /**
     * The whole point of the two-phase design: the set is read whole, so it must
     * be read cheaply. `includeAll` would carry images, criteria, OE numbers,
     * prices and linkages for hundreds of rows — 27 KB a row against 0.9 KB.
     */
    it('asks for none of the heavy collections', async () => {
      call.mockResolvedValueOnce({ articles: [] });

      await tecdoc.getCrossReferenceCandidates('BD-1', BRAKE_DISC);

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.not.objectContaining({
          includeAll: expect.anything(),
          includeImages: expect.anything(),
          includeArticleCriteria: expect.anything(),
          includeOEMNumbers: expect.anything(),
        }),
      );
    });

    // Narrowing to a brand would answer with the viewed part alone: the point of
    // the search is the other brands making a replacement for the same part.
    it('does not narrow the search to a brand', async () => {
      call.mockResolvedValueOnce({ articles: [] });

      await tecdoc.getCrossReferenceCandidates('BD-1', BRAKE_DISC);

      expect(call).toHaveBeenCalledWith(
        'getArticles',
        expect.not.objectContaining({ dataSupplierIds: expect.anything() }),
      );
    });

    // `CANDIDATE_LIMIT` is the largest page TecDoc serves, so there is no second
    // page to ask for and the widest set measured fits inside it three times over.
    it('reads the whole set in one call', async () => {
      call.mockResolvedValue({
        totalMatchingArticles: 3,
        articles: [
          candidateRecord('A1'),
          candidateRecord('A2'),
          candidateRecord('A3'),
        ],
      });

      const candidates = await tecdoc.getCrossReferenceCandidates(
        'BD-1',
        BRAKE_DISC,
      );

      expect(call).toHaveBeenCalledTimes(1);
      expect(candidates.map((c) => c.articleNumber)).toEqual([
        'A1',
        'A2',
        'A3',
      ]);
    });

    /**
     * The ordering step ranks whatever it is handed, so a set cut short would let
     * the parts we stock be the ones missing — the failure the previous design was
     * replaced for. Nothing in the data reaches this, which is exactly why it has
     * to announce itself if it ever does.
     */
    it('warns when the match count outruns what one call can carry', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1200,
        articles: [candidateRecord('A1')],
      });

      await tecdoc.getCrossReferenceCandidates('BD-1', BRAKE_DISC);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('truncated'));

      warn.mockRestore();
    });

    it('stays quiet on a set that arrived whole', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [candidateRecord('A1')],
      });

      await tecdoc.getCrossReferenceCandidates('BD-1', BRAKE_DISC);

      expect(warn).not.toHaveBeenCalled();

      warn.mockRestore();
    });

    it('maps each row to a candidate with its provenance', async () => {
      call.mockResolvedValueOnce({
        totalMatchingArticles: 1,
        articles: [candidateRecord('DF4074', { articleStatusId: 8 })],
      });

      const [candidate] = await tecdoc.getCrossReferenceCandidates(
        'BD-1',
        BRAKE_DISC,
      );

      expect(candidate).toEqual({
        brandId: '101',
        brandName: 'Ferodo',
        articleNumber: 'DF4074',
        description: 'Спирачен диск',
        legacyArticleIds: [777],
        articleStatusId: 8,
        citedNumbers: [{ brandId: '30', articleNumber: 'BD-1' }],
      });
    });

    it('returns an empty list when nothing cross-references the part', async () => {
      call.mockResolvedValueOnce({ totalMatchingArticles: 0, status: 200 });

      expect(
        await tecdoc.getCrossReferenceCandidates('BD-1', BRAKE_DISC),
      ).toEqual([]);
    });
  });

  describe('getArticleRowsByLegacyIds', () => {
    it('hydrates the given ids into rows, asking only for what a row renders', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      const rows = await tecdoc.getArticleRowsByLegacyIds([777, 778]);

      expect(call).toHaveBeenCalledWith('getArticles', {
        articleCountry: 'BG',
        lang: 'bg',
        legacyArticleIds: [777, 778],
        perPage: 2,
        page: 1,
        includeGenericArticles: true,
        includeArticleCriteria: true,
        includeImages: true,
      });
      expect(rows.map((row) => row.articleNumber)).toEqual(['A1']);
    });

    // OE numbers are the bulkiest field on an article — 34 to 61 on a filter,
    // roughly half a hydrated row — and `mapArticleSummary` reads neither them
    // nor the article text, so both were paid for and dropped.
    it('asks for nothing a row does not render', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1')] });

      await tecdoc.getArticleRowsByLegacyIds([777]);

      const [, params] = call.mock.calls[0];
      for (const flag of [
        'includeAll',
        'includeOEMNumbers',
        'includeArticleText',
      ]) {
        expect(params).not.toHaveProperty(flag);
      }
    });

    /**
     * A call given 20 ids came back with 19 rows. Whatever the reason, the rows
     * TecDoc did return are worth showing, so a short answer is the answer — the
     * caller aligns it back to the ids it asked for.
     */
    it('answers with the rows it got when TecDoc returns fewer than asked', async () => {
      call.mockResolvedValueOnce({ articles: [record('A1'), record('A2')] });

      const rows = await tecdoc.getArticleRowsByLegacyIds([1, 2, 3]);

      expect(rows).toHaveLength(2);
    });

    it('does not call TecDoc for an empty id list', async () => {
      expect(await tecdoc.getArticleRowsByLegacyIds([])).toEqual([]);
      expect(call).not.toHaveBeenCalled();
    });
  });
});
