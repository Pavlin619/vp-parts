import { SupplierCatalogRepository } from './supplier-catalog.repository';
import { PrismaService } from '../prisma';

const queryRaw = jest.fn();
const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

const KNECHT = '34';

function packageRow(
  overrides: Partial<Record<string, string | null>> = {},
): Record<string, string | null> {
  return {
    package_weight_kg: '0.068',
    package_length_cm: '12.000',
    package_width_cm: '7.500',
    package_height_cm: '7.500',
    ...overrides,
  };
}

describe('SupplierCatalogRepository', () => {
  let repository: SupplierCatalogRepository;

  beforeEach(() => {
    repository = new SupplierCatalogRepository(prisma);
    jest.clearAllMocks();
  });

  describe('findPackageProfile', () => {
    it('converts kilograms to whole grams and keeps the box in centimetres', async () => {
      queryRaw.mockResolvedValueOnce([packageRow()]);

      const profile = await repository.findPackageProfile({
        brandId: KNECHT,
        articleNumber: 'OX 389/1D',
      });

      expect(profile).toEqual({
        weightGrams: 68,
        packageCm: { length: 12, width: 7.5, height: 7.5 },
      });
    });

    it('matches on the number and the brand together', async () => {
      queryRaw.mockResolvedValueOnce([]);

      await repository.findPackageProfile({
        brandId: KNECHT,
        articleNumber: 'OX 389/1D',
      });

      const [sql] = queryRaw.mock.calls[0] as [
        { text: string; values: unknown[] },
      ];
      expect(sql.text).toContain('tecdoc_number =');
      expect(sql.text).toContain('tecdoc_supplier_id =');
      expect(sql.values).toEqual(['OX 389/1D', KNECHT]);
    });

    it('is unknown when the catalogue does not hold the part', async () => {
      queryRaw.mockResolvedValueOnce([]);

      const profile = await repository.findPackageProfile({
        brandId: KNECHT,
        articleNumber: 'NOPE',
      });

      expect(profile).toEqual({ weightGrams: null, packageCm: null });
    });

    it('reports a weight with no box', async () => {
      queryRaw.mockResolvedValueOnce([
        packageRow({
          package_length_cm: null,
          package_width_cm: null,
          package_height_cm: null,
        }),
      ]);

      const profile = await repository.findPackageProfile({
        brandId: KNECHT,
        articleNumber: 'A',
      });

      expect(profile).toEqual({ weightGrams: 68, packageCm: null });
    });

    it('drops a box with a missing side rather than invent one', async () => {
      queryRaw.mockResolvedValueOnce([packageRow({ package_height_cm: null })]);

      const profile = await repository.findPackageProfile({
        brandId: KNECHT,
        articleNumber: 'A',
      });

      expect(profile.packageCm).toBeNull();
    });

    it('treats a zero measurement as not measured', async () => {
      queryRaw.mockResolvedValueOnce([
        packageRow({ package_weight_kg: '0.000', package_width_cm: '0.000' }),
      ]);

      const profile = await repository.findPackageProfile({
        brandId: KNECHT,
        articleNumber: 'A',
      });

      expect(profile).toEqual({ weightGrams: null, packageCm: null });
    });
  });

  describe('findPackageProfiles', () => {
    it('reads every identity in one query and converts each row', async () => {
      queryRaw.mockResolvedValueOnce([
        packageRow(),
        packageRow({ package_weight_kg: '1.250', package_height_cm: null }),
      ]);

      const profiles = await repository.findPackageProfiles([
        { brandId: KNECHT, articleNumber: 'OX 389/1D' },
        { brandId: '30', articleNumber: '0986479061' },
      ]);

      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(profiles).toEqual([
        {
          weightGrams: 68,
          packageCm: { length: 12, width: 7.5, height: 7.5 },
        },
        { weightGrams: 1250, packageCm: null },
      ]);
    });

    it('pairs each number with its own brand and keeps one row per identity', async () => {
      queryRaw.mockResolvedValueOnce([]);

      await repository.findPackageProfiles([
        { brandId: KNECHT, articleNumber: 'OX 389/1D' },
        { brandId: '30', articleNumber: '0986479061' },
      ]);

      const [sql] = queryRaw.mock.calls[0] as [
        { text: string; values: unknown[] },
      ];
      expect(sql.text).toContain('unnest(');
      expect(sql.text).toContain('DISTINCT ON');
      expect(sql.text).toContain('c.tecdoc_number = wanted.article_number');
      expect(sql.text).toContain('c.tecdoc_supplier_id = wanted.brand_id');
      expect(sql.values).toEqual([
        ['OX 389/1D', '0986479061'],
        [KNECHT, '30'],
      ]);
    });

    it('asks nothing for no identities', async () => {
      await expect(repository.findPackageProfiles([])).resolves.toEqual([]);
      expect(queryRaw).not.toHaveBeenCalled();
    });
  });
});
