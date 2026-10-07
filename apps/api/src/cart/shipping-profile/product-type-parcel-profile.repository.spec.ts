import { PrismaService } from '../../prisma';
import { ProductTypeParcelProfileRepository } from './product-type-parcel-profile.repository';

const COMPUTED_AT = new Date('2026-10-07T12:00:00Z');

const row = {
  genericArticleId: 82,
  productTypeName: 'Спирачен диск',
  weightGrams: 5200,
  packageLengthCm: 30,
  packageWidthCm: 30,
  packageHeightCm: 8,
  sampleSize: 40,
  computedAt: COMPUTED_AT,
};

describe('ProductTypeParcelProfileRepository', () => {
  const findUnique = jest.fn();
  const deleteMany = jest.fn();
  const createMany = jest.fn();
  const transaction = jest.fn();
  const prisma = {
    productTypeParcelProfile: { findUnique, deleteMany, createMany },
    $transaction: transaction,
  } as unknown as PrismaService;
  let repository: ProductTypeParcelProfileRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockResolvedValue([]);
    repository = new ProductTypeParcelProfileRepository(prisma);
  });

  describe('findByGenericArticleId', () => {
    it('maps the row to a profile with its box', async () => {
      findUnique.mockResolvedValueOnce(row);

      await expect(repository.findByGenericArticleId(82)).resolves.toEqual({
        weightGrams: 5200,
        packageCm: { length: 30, width: 30, height: 8 },
        sampleSize: 40,
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { genericArticleId: 82 },
      });
    });

    it('has no box unless all three sides are stored', async () => {
      findUnique.mockResolvedValueOnce({ ...row, packageHeightCm: null });

      const profile = await repository.findByGenericArticleId(82);

      expect(profile?.packageCm).toBeNull();
    });

    it('is null for a product type with no row', async () => {
      findUnique.mockResolvedValueOnce(null);

      await expect(repository.findByGenericArticleId(1)).resolves.toBeNull();
    });
  });

  describe('replaceAll', () => {
    it('deletes and inserts in one transaction', async () => {
      await repository.replaceAll([
        {
          genericArticleId: 82,
          productTypeName: 'Спирачен диск',
          weightGrams: 5200,
          packageCm: { length: 30, width: 30, height: 8 },
          sampleSize: 40,
          computedAt: COMPUTED_AT,
        },
        {
          genericArticleId: 7,
          productTypeName: 'Маслен филтър',
          weightGrams: 300,
          packageCm: null,
          sampleSize: 1,
          computedAt: COMPUTED_AT,
        },
      ]);

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(deleteMany).toHaveBeenCalledWith({});
      expect(createMany).toHaveBeenCalledWith({
        data: [
          row,
          {
            genericArticleId: 7,
            productTypeName: 'Маслен филтър',
            weightGrams: 300,
            packageLengthCm: null,
            packageWidthCm: null,
            packageHeightCm: null,
            sampleSize: 1,
            computedAt: COMPUTED_AT,
          },
        ],
      });
    });

    it('does not run the writes outside the transaction', async () => {
      transaction.mockRejectedValueOnce(new Error('insert failed'));

      await expect(repository.replaceAll([])).rejects.toThrow('insert failed');
    });
  });
});
