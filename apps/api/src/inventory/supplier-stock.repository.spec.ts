import { articleIdentityKey } from '@vp-parts-shop/shared';
import { SupplierStockRepository } from './supplier-stock.repository';
import { PrismaService } from '../prisma';

const queryRaw = jest.fn();
const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

const BOSCH = '30';
const SPIDAN = '1';

/** The SQL text and bound parameters of the last query the repository ran. */
function lastQuery(): { text: string; values: unknown[] } {
  const [sql] = queryRaw.mock.calls.at(-1) as [
    { text: string; values: unknown[] },
  ];

  return { text: sql.text, values: sql.values };
}

describe('SupplierStockRepository', () => {
  let repository: SupplierStockRepository;

  beforeEach(() => {
    repository = new SupplierStockRepository(prisma);
    jest.clearAllMocks();
  });

  describe('findByArticle', () => {
    it('maps raw rows to integer-cent rows', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          supplier_source: 'INTERCARS',
          warehouse_code: 'W1',
          availability: 5,
          buy_price: '40.00',
          sell_price: '54.95',
          tecdoc_number: '0986478451',
          tecdoc_supplier_id: BOSCH,
        },
      ]);

      const rows = await repository.findByArticle({
        brandId: BOSCH,
        articleNumber: '0986478451',
      });

      expect(rows).toEqual([
        {
          supplierSource: 'INTERCARS',
          warehouseCode: 'W1',
          availability: 5,
          buyPriceCents: 4000,
          sellPriceCents: 5495,
          tecdocNumber: '0986478451',
          brandId: BOSCH,
        },
      ]);
    });

    // A number is not an identity: the brand has to reach the WHERE clause, or
    // another supplier's line under the same number prices this part.
    it('matches on the number and the brand', async () => {
      queryRaw.mockResolvedValueOnce([]);

      await repository.findByArticle({
        brandId: BOSCH,
        articleNumber: 'WL6340',
      });

      const { text, values } = lastQuery();
      expect(text).toContain('tecdoc_number =');
      expect(text).toContain('tecdoc_supplier_id =');
      expect(values).toEqual(['WL6340', BOSCH]);
    });

    it('preserves a missing quantity as null and coerces decimal-ish prices', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          supplier_source: 'AUTO1',
          warehouse_code: null,
          availability: null,
          buy_price: null,
          sell_price: 12.5,
          tecdoc_number: 'X',
          tecdoc_supplier_id: BOSCH,
        },
      ]);

      const [row] = await repository.findByArticle({
        brandId: BOSCH,
        articleNumber: 'X',
      });

      expect(row.availability).toBeNull();
      expect(row.buyPriceCents).toBe(0);
      expect(row.sellPriceCents).toBe(1250);
      expect(row.warehouseCode).toBeNull();
    });
  });

  describe('findByArticles', () => {
    it('returns an empty map without querying for an empty input', async () => {
      const result = await repository.findByArticles([]);

      expect(result.size).toBe(0);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('sends the wanted pairs as two parallel arrays', async () => {
      queryRaw.mockResolvedValueOnce([]);

      await repository.findByArticles([
        { brandId: BOSCH, articleNumber: 'A' },
        { brandId: SPIDAN, articleNumber: 'B' },
      ]);

      const { text, values } = lastQuery();
      expect(text).toContain('unnest');
      expect(values).toEqual([
        ['A', 'B'],
        [BOSCH, SPIDAN],
      ]);
    });

    it('groups rows by article identity, not by number', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          supplier_source: 'INTERCARS',
          warehouse_code: 'W1',
          availability: 3,
          buy_price: '40.00',
          sell_price: '55.00',
          tecdoc_number: 'A',
          tecdoc_supplier_id: BOSCH,
        },
        {
          supplier_source: 'AUTOPLUS',
          warehouse_code: 'W2',
          availability: 2,
          buy_price: '42.00',
          sell_price: '56.00',
          tecdoc_number: 'A',
          tecdoc_supplier_id: SPIDAN,
        },
        {
          supplier_source: 'AUTO1',
          warehouse_code: 'W3',
          availability: 1,
          buy_price: '10.00',
          sell_price: '15.00',
          tecdoc_number: 'A',
          tecdoc_supplier_id: BOSCH,
        },
      ]);

      const result = await repository.findByArticles([
        { brandId: BOSCH, articleNumber: 'A' },
        { brandId: SPIDAN, articleNumber: 'A' },
      ]);

      // Two brands file 'A': each gets its own entry, never a shared one.
      expect(result.get(articleIdentityKey(BOSCH, 'A'))).toHaveLength(2);
      expect(result.get(articleIdentityKey(SPIDAN, 'A'))).toHaveLength(1);
      expect(
        result.get(articleIdentityKey(BOSCH, 'A'))?.[0].supplierSource,
      ).toBe('INTERCARS');
    });
  });
});
