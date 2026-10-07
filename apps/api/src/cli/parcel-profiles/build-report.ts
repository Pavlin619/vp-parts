import { quantile } from '../../cart';
import type { CallStatistics } from './paced-tecdoc';
import type { TypeResult } from './checkpoint-store';

const UPPER_QUARTILE = 0.75;

export interface UnweighedType {
  genericArticleId: number;
  productTypeName: string;
  articleCount: number;
}

export interface BuildReport {
  typesListed: number;
  typesWritten: number;
  isStored: boolean;
  /** The weight a part of a type we know nothing about is quoted at. */
  globalP75WeightGrams: number | null;
  /** Largest first, so a bulky type is easy to spot. */
  typesWithoutWeight: UnweighedType[];
  /** This session only: a resumed run does not count the calls of the one before. */
  calls: number;
  retries: number;
  durationMs: number;
}

interface ReportInput {
  results: TypeResult[];
  typesWritten: number;
  isStored: boolean;
  statistics: CallStatistics;
  durationMs: number;
}

export function buildReport({
  results,
  typesWritten,
  isStored,
  statistics,
  durationMs,
}: ReportInput): BuildReport {
  const weights = results.flatMap((result) =>
    result.samples.flatMap((sample) =>
      sample.weightGrams === null ? [] : [sample.weightGrams],
    ),
  );

  return {
    typesListed: results.length,
    typesWritten,
    isStored,
    globalP75WeightGrams:
      weights.length === 0
        ? null
        : Math.round(quantile(weights, UPPER_QUARTILE)),
    typesWithoutWeight: results
      .filter((result) => result.samples.length === 0)
      .map(({ genericArticleId, productTypeName, articleCount }) => ({
        genericArticleId,
        productTypeName,
        articleCount,
      }))
      .sort((left, right) => right.articleCount - left.articleCount),
    ...statistics,
    durationMs,
  };
}
