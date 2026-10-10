import { Injectable, Logger } from '@nestjs/common';
import {
  ProductTypeParcelProfileRepository,
  ProductTypeProfileRow,
  aggregateProductTypeProfile,
} from '../../cart';
import { SupplierCatalogRepository } from '../../inventory';
import { TecDocTransport } from '../../tecdoc';
import { BuildReport, buildReport } from './build-report';
import { CheckpointStore, TypeResult } from './checkpoint-store';
import {
  Clock,
  DEFAULT_PACING,
  PacedTecDoc,
  PacingOptions,
  systemClock,
} from './paced-tecdoc';
import { ProductType, ProductTypeCatalogue } from './product-type-catalogue';
import { StockedBrandsRepository } from './stocked-brands.repository';

export interface BuildOptions {
  checkpoint: CheckpointStore;
  /** What to do when the checkpoint already holds finished types. */
  existingCheckpoint: 'resume' | 'discard' | 'refuse';
  isDryRun: boolean;
  /** Restricts the run to these product types; such a run never replaces the table. */
  onlyTypeIds?: number[];
  /** Restricts the run to the N types with the most articles; never replaces the table. */
  limit?: number;
  pacing?: PacingOptions;
  clock?: Clock;
}

export class CheckpointExistsError extends Error {
  constructor() {
    super(
      'A checkpoint with finished types exists. Pass --resume to continue it or --fresh to discard it.',
    );
  }
}

const PROGRESS_LOG_EVERY = 50;

/**
 * Rebuilds the product-type fallback table: TecDoc says which articles each
 * type holds, our own catalogue says what they weigh. See
 * docs/DELIVERY-PROVIDERS.md.
 */
@Injectable()
export class ParcelProfileBuilder {
  private readonly logger = new Logger(ParcelProfileBuilder.name);

  constructor(
    private readonly transport: TecDocTransport,
    private readonly stockedBrands: StockedBrandsRepository,
    private readonly supplierCatalog: SupplierCatalogRepository,
    private readonly profiles: ProductTypeParcelProfileRepository,
  ) {}

  async run(options: BuildOptions): Promise<BuildReport> {
    const clock = options.clock ?? systemClock;
    const startedAt = clock.now();
    const finished = await this.loadFinished(options);

    const brands = await this.stockedBrands.findStockedBrands();
    const brandIds = brands.map((brand) => brand.brandId);
    const weighedCounts = new Map(
      brands.map((brand) => [brand.brandId, brand.weighedCount]),
    );

    const tecDoc = new PacedTecDoc(
      this.transport,
      options.pacing ?? DEFAULT_PACING,
      clock,
    );
    const catalogue = new ProductTypeCatalogue(tecDoc);
    const types = selectTypes(
      await catalogue.listProductTypes(brandIds),
      options,
    );
    this.logger.log(
      `${brandIds.length} stocked brands, ${types.length} product types to read, ${finished.size} already finished`,
    );

    const results: TypeResult[] = [];

    for (const [index, type] of types.entries()) {
      let result = finished.get(type.genericArticleId);

      if (result === undefined) {
        const identities = await catalogue.readArticles(
          type,
          brandIds,
          weighedCounts,
        );
        result = await this.weigh(type, identities);
        await options.checkpoint.append(result);
        this.logProgress(index + 1, types.length, result, identities.length);
      }

      results.push(result);
    }

    const rows = toRows(results, new Date(clock.now()));
    const isStored = !options.isDryRun && !isPartial(options);

    if (isStored) {
      await this.profiles.replaceAll(rows);
    }

    return buildReport({
      results,
      typesWritten: rows.length,
      isStored,
      statistics: tecDoc.statistics,
      durationMs: clock.now() - startedAt,
    });
  }

  private async loadFinished(
    options: BuildOptions,
  ): Promise<Map<number, TypeResult>> {
    const hasProgress = await options.checkpoint.hasProgress();

    if (hasProgress && options.existingCheckpoint === 'refuse') {
      throw new CheckpointExistsError();
    }

    if (options.existingCheckpoint === 'discard') {
      await options.checkpoint.reset();
    }

    const results =
      options.existingCheckpoint === 'resume'
        ? await options.checkpoint.load()
        : [];

    return new Map(results.map((result) => [result.genericArticleId, result]));
  }

  private async weigh(
    type: ProductType,
    identities: { brandId: string; articleNumber: string }[],
  ): Promise<TypeResult> {
    const profiles = await this.supplierCatalog.findPackageProfiles(identities);

    return {
      genericArticleId: type.genericArticleId,
      productTypeName: type.name,
      articleCount: type.articleCount,
      samples: profiles.filter((profile) => profile.weightGrams !== null),
    };
  }

  private logProgress(
    position: number,
    total: number,
    result: TypeResult,
    articlesRead: number,
  ): void {
    const isBig = result.articleCount > 1000;

    if (isBig || position % PROGRESS_LOG_EVERY === 0 || position === total) {
      this.logger.log(
        `[${position}/${total}] ${result.genericArticleId} ${result.productTypeName}: ` +
          `${articlesRead} articles read, ${result.samples.length} weighed`,
      );
    }
  }
}

function isPartial({ onlyTypeIds, limit }: BuildOptions): boolean {
  return onlyTypeIds !== undefined || limit !== undefined;
}

/** Biggest types first, so a short run exercises the expensive path too. */
function selectTypes(
  types: ProductType[],
  { onlyTypeIds, limit }: BuildOptions,
): ProductType[] {
  const wanted =
    onlyTypeIds === undefined
      ? types
      : types.filter((type) => onlyTypeIds.includes(type.genericArticleId));
  const biggestFirst = [...wanted].sort(
    (left, right) => right.articleCount - left.articleCount,
  );

  return limit === undefined ? biggestFirst : biggestFirst.slice(0, limit);
}

function toRows(
  results: TypeResult[],
  computedAt: Date,
): ProductTypeProfileRow[] {
  return results.flatMap((result) => {
    const profile = aggregateProductTypeProfile(result.samples);

    return profile === null
      ? []
      : [
          {
            ...profile,
            genericArticleId: result.genericArticleId,
            productTypeName: result.productTypeName,
            computedAt,
          },
        ];
  });
}
