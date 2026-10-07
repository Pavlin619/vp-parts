import { buildReport } from './build-report';
import type { TypeResult } from './checkpoint-store';

const type = (
  genericArticleId: number,
  articleCount: number,
  weights: number[],
): TypeResult => ({
  genericArticleId,
  productTypeName: `type ${genericArticleId}`,
  articleCount,
  samples: weights.map((weightGrams) => ({ weightGrams, packageCm: null })),
});

const base = {
  typesWritten: 0,
  isStored: false,
  statistics: { calls: 10, retries: 1 },
  durationMs: 5000,
};

describe('buildReport', () => {
  it('lists types without a weight, largest first', () => {
    const report = buildReport({
      ...base,
      results: [
        type(1, 5, []),
        type(2, 50, [100]),
        type(3, 900, []),
        type(4, 20, []),
      ],
    });

    expect(
      report.typesWithoutWeight.map((entry) => entry.genericArticleId),
    ).toEqual([3, 4, 1]);
    expect(report.typesWithoutWeight[0]).toEqual({
      genericArticleId: 3,
      productTypeName: 'type 3',
      articleCount: 900,
    });
  });

  it('takes the global p75 over every weighed sample', () => {
    const report = buildReport({
      ...base,
      results: [type(1, 3, [100, 200]), type(2, 3, [300, 400])],
    });

    expect(report.globalP75WeightGrams).toBe(325);
  });

  it('has no global p75 when nothing was weighed', () => {
    expect(
      buildReport({ ...base, results: [type(1, 3, [])] }).globalP75WeightGrams,
    ).toBeNull();
  });

  it('carries the call statistics, duration and what was stored', () => {
    const report = buildReport({
      ...base,
      results: [type(1, 3, [100])],
      typesWritten: 1,
      isStored: true,
    });

    expect(report).toMatchObject({
      typesListed: 1,
      typesWritten: 1,
      isStored: true,
      calls: 10,
      retries: 1,
      durationMs: 5000,
    });
  });
});
