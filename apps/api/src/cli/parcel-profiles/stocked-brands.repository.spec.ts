import { PrismaService } from '../../prisma';
import { StockedBrandsRepository } from './stocked-brands.repository';

describe('StockedBrandsRepository', () => {
  it('returns numeric brand ids with their weighed counts', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([
      { brand_id: '421', weighed_count: BigInt(120) },
      { brand_id: '34', weighed_count: 0 },
    ]);
    const repository = new StockedBrandsRepository({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);

    await expect(repository.findStockedBrands()).resolves.toEqual([
      { brandId: 421, weighedCount: 120 },
      { brandId: 34, weighedCount: 0 },
    ]);
  });
});
