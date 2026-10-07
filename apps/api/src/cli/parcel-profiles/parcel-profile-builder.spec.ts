import { ProductTypeParcelProfileRepository } from '../../cart';
import { SupplierCatalogRepository } from '../../inventory';
import { TecDocTransport } from '../../tecdoc';
import { CheckpointStore, TypeResult } from './checkpoint-store';
import { Clock, TecDocRunAbortedError } from './paced-tecdoc';
import {
  BuildOptions,
  CheckpointExistsError,
  ParcelProfileBuilder,
} from './parcel-profile-builder';
import { StockedBrandsRepository } from './stocked-brands.repository';

class FakeClock implements Clock {
  current = 1_000_000;
  now = () => this.current;
  sleep = (milliseconds: number) => {
    this.current += milliseconds;

    return Promise.resolve();
  };
}

class MemoryCheckpoint implements CheckpointStore {
  constructor(public results: TypeResult[] = []) {}
  hasProgress = () => Promise.resolve(this.results.length > 0);
  load = () => Promise.resolve([...this.results]);
  append = (result: TypeResult) => {
    this.results.push(result);

    return Promise.resolve();
  };
  reset = () => {
    this.results = [];

    return Promise.resolve();
  };
}

const facetOf = (id: number, count: number) => ({
  genericArticleId: id,
  genericArticleDescription: `Type ${id}`,
  count,
});

describe('ParcelProfileBuilder', () => {
  const call = jest.fn();
  const findStockedBrands = jest.fn();
  const findPackageProfiles = jest.fn();
  const replaceAll = jest.fn();
  let clock: FakeClock;
  let checkpoint: MemoryCheckpoint;
  let builder: ParcelProfileBuilder;

  const options = (overrides: Partial<BuildOptions> = {}): BuildOptions => ({
    checkpoint,
    existingCheckpoint: 'discard',
    isDryRun: false,
    clock,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    clock = new FakeClock();
    checkpoint = new MemoryCheckpoint();
    findStockedBrands.mockResolvedValue([
      { brandId: 1, weighedCount: 10 },
      { brandId: 2, weighedCount: 20 },
    ]);
    call.mockImplementation((_function, params) => {
      if (params.includeGenericArticleFacets) {
        return Promise.resolve({
          genericArticleFacets: { counts: [facetOf(7, 3), facetOf(8, 2)] },
        });
      }

      return Promise.resolve({
        articles: [
          {
            articleNumber: `N${params.genericArticleIds[0]}`,
            dataSupplierId: 1,
          },
        ],
      });
    });
    findPackageProfiles.mockResolvedValue([
      { weightGrams: 400, packageCm: { length: 10, width: 5, height: 2 } },
    ]);
    builder = new ParcelProfileBuilder(
      { call } as unknown as TecDocTransport,
      { findStockedBrands } as unknown as StockedBrandsRepository,
      { findPackageProfiles } as unknown as SupplierCatalogRepository,
      { replaceAll } as unknown as ProductTypeParcelProfileRepository,
    );
  });

  it('weighs each type from the catalogue and stores one row per weighed type', async () => {
    findPackageProfiles
      .mockResolvedValueOnce([{ weightGrams: 400, packageCm: null }])
      .mockResolvedValueOnce([{ weightGrams: null, packageCm: null }]);

    const report = await builder.run(options());

    expect(replaceAll).toHaveBeenCalledTimes(1);
    expect(replaceAll.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        genericArticleId: 7,
        productTypeName: expect.any(String),
        weightGrams: 400,
        sampleSize: 1,
        computedAt: new Date(clock.current),
      }),
    ]);
    expect(report).toMatchObject({
      typesListed: 2,
      typesWritten: 1,
      isStored: true,
    });
    expect(report.typesWithoutWeight).toEqual([
      expect.objectContaining({ genericArticleId: 8, articleCount: 2 }),
    ]);
  });

  it('asks TecDoc only about the brands we stock', async () => {
    await builder.run(options());

    expect(call.mock.calls[0][1]).toMatchObject({ dataSupplierIds: [1, 2] });
    expect(call.mock.calls[1][1]).toMatchObject({ dataSupplierIds: [1, 2] });
  });

  it('paces the calls one second apart', async () => {
    await builder.run(options());

    expect(clock.current - 1_000_000).toBe(2000);
  });

  it('does not store on a dry run', async () => {
    const report = await builder.run(options({ isDryRun: true }));

    expect(replaceAll).not.toHaveBeenCalled();
    expect(report.isStored).toBe(false);
  });

  it('never replaces the table from a partial run', async () => {
    const report = await builder.run(options({ limit: 1 }));

    expect(replaceAll).not.toHaveBeenCalled();
    expect(report).toMatchObject({ typesListed: 1, isStored: false });
  });

  it('reads the biggest types first and can be restricted to chosen ones', async () => {
    await builder.run(options({ onlyTypeIds: [8] }));

    expect(checkpoint.results.map((result) => result.genericArticleId)).toEqual(
      [8],
    );
  });

  it('skips types a resumed run already finished', async () => {
    checkpoint.results = [
      {
        genericArticleId: 7,
        productTypeName: 'Type 7',
        articleCount: 3,
        samples: [{ weightGrams: 900, packageCm: null }],
      },
    ];

    const report = await builder.run(options({ existingCheckpoint: 'resume' }));

    expect(findPackageProfiles).toHaveBeenCalledTimes(1);
    expect(checkpoint.results.map((result) => result.genericArticleId)).toEqual(
      [7, 8],
    );
    expect(replaceAll.mock.calls[0][0][0]).toMatchObject({
      genericArticleId: 7,
      weightGrams: 900,
    });
    expect(report.typesListed).toBe(2);
  });

  it('refuses to overwrite an existing checkpoint unless told to', async () => {
    checkpoint.results = [
      {
        genericArticleId: 7,
        productTypeName: 'x',
        articleCount: 1,
        samples: [],
      },
    ];

    await expect(
      builder.run(options({ existingCheckpoint: 'refuse' })),
    ).rejects.toBeInstanceOf(CheckpointExistsError);
    expect(checkpoint.results).toHaveLength(1);
  });

  it('discards an existing checkpoint on request', async () => {
    checkpoint.results = [
      {
        genericArticleId: 99,
        productTypeName: 'x',
        articleCount: 1,
        samples: [],
      },
    ];

    await builder.run(options({ existingCheckpoint: 'discard' }));

    expect(
      checkpoint.results.map((result) => result.genericArticleId),
    ).not.toContain(99);
  });

  it('keeps finished types and stores nothing when TecDoc stops answering', async () => {
    let reads = 0;
    call.mockImplementation((_function, params) => {
      if (params.includeGenericArticleFacets) {
        return Promise.resolve({
          genericArticleFacets: { counts: [facetOf(7, 3), facetOf(8, 2)] },
        });
      }
      reads += 1;

      return reads === 1
        ? Promise.resolve({
            articles: [{ articleNumber: 'A', dataSupplierId: 1 }],
          })
        : Promise.reject(new Error('503'));
    });

    await expect(builder.run(options())).rejects.toBeInstanceOf(
      TecDocRunAbortedError,
    );

    expect(checkpoint.results.map((result) => result.genericArticleId)).toEqual(
      [7],
    );
    expect(replaceAll).not.toHaveBeenCalled();
  });
});
