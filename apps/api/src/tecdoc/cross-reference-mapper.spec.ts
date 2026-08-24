import { TecDocArticleRecord } from './article-mapper';
import { mapCrossReferenceCandidate } from './cross-reference-mapper';

const A_B_S = 220;

function record(
  overrides: Partial<TecDocArticleRecord> = {},
): TecDocArticleRecord {
  return {
    articleNumber: '16 100',
    dataSupplierId: 4,
    mfrName: 'MANN-FILTER',
    genericArticles: [
      {
        genericArticleId: 82,
        genericArticleDescription: 'Спирачен диск',
        legacyArticleId: 555,
      },
    ],
    misc: { articleStatusId: 1 },
    ...overrides,
  };
}

describe('mapCrossReferenceCandidate', () => {
  it('maps identity, brand, part name, hydration ids and status', () => {
    expect(mapCrossReferenceCandidate(record())).toEqual({
      brandId: '4',
      brandName: 'MANN-FILTER',
      articleNumber: '16 100',
      description: 'Спирачен диск',
      legacyArticleIds: [555],
      articleStatusId: 1,
      citedNumbers: [],
    });
  });

  // A part TecDoc files no status for is not a part in normal supply; the
  // ordering treats the two differently, so the mapping must keep them apart.
  it('reports a missing status as null rather than normal', () => {
    const candidate = mapCrossReferenceCandidate(record({ misc: undefined }));

    expect(candidate.articleStatusId).toBeNull();
  });

  it('keeps every cross-reference the row matched, with the brand that filed it', () => {
    const candidate = mapCrossReferenceCandidate(
      record({
        comparableNumbers: [
          { articleNumber: '16100', dataSupplierId: A_B_S },
          { articleNumber: '16.100', dataSupplierId: 2323 },
        ],
      }),
    );

    expect(candidate.citedNumbers).toEqual([
      { brandId: '220', articleNumber: '16100' },
      { brandId: '2323', articleNumber: '16.100' },
    ]);
  });

  // Both of these would otherwise read as "this row cites the part we searched
  // for", which is the one thing the provenance filter relies on being true.
  it('drops a reference to another part and one it cannot attribute', () => {
    const candidate = mapCrossReferenceCandidate(
      record({
        comparableNumbers: [
          {
            articleNumber: '16200',
            dataSupplierId: A_B_S,
            matchesSearchQuery: false,
          },
          { articleNumber: '16100' },
        ],
      }),
    );

    expect(candidate.citedNumbers).toEqual([]);
  });

  it('maps a row TecDoc files no generic article against', () => {
    const candidate = mapCrossReferenceCandidate(
      record({ genericArticles: undefined }),
    );

    expect(candidate.description).toBe('');
    expect(candidate.legacyArticleIds).toEqual([]);
  });
});
