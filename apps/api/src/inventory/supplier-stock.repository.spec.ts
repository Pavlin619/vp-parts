import { SupplierStockRepository } from './supplier-stock.repository';
import { PrismaService } from '../prisma';

const queryRaw = jest.fn();
const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

describe('SupplierStockRepository', () => {
  let repository: SupplierStockRepository;

  beforeEach(() => {
    repository = new SupplierStockRepository(prisma);
    jest.clearAllMocks();
  });

  describe('findByTecdocNumber', () => {
    it('maps raw rows to integer-cent rows', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          supplier_source: 'INTERCARS',
          warehouse_code: 'W1',
          availability: 5,
          buy_price: '40.00',
          sell_price: '54.95',
          tecdoc_number: '0986478451',
        },
      ]);

      const rows = await repository.findByTecdocNumber('0986478451');

      expect(rows).toEqual([
        {
          supplierSource: 'INTERCARS',
          warehouseCode: 'W1',
          availability: 5,
          buyPriceCents: 4000,
          sellPriceCents: 5495,
          tecdocNumber: '0986478451',
        },
      ]);
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
        },
      ]);

      const [row] = await repository.findByTecdocNumber('X');

      expect(row.availability).toBeNull();
      expect(row.buyPriceCents).toBe(0);
      expect(row.sellPriceCents).toBe(1250);
      expect(row.warehouseCode).toBeNull();
    });
  });

  describe('findByTecdocNumbers', () => {
    it('returns an empty map without querying for an empty input', async () => {
      const result = await repository.findByTecdocNumbers([]);

      expect(result.size).toBe(0);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('groups rows by tecdoc number', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          supplier_source: 'INTERCARS',
          warehouse_code: 'W1',
          availability: 3,
          buy_price: '40.00',
          sell_price: '55.00',
          tecdoc_number: 'A',
        },
        {
          supplier_source: 'AUTOPLUS',
          warehouse_code: 'W2',
          availability: 2,
          buy_price: '42.00',
          sell_price: '56.00',
          tecdoc_number: 'A',
        },
        {
          supplier_source: 'AUTO1',
          warehouse_code: 'W3',
          availability: 1,
          buy_price: '10.00',
          sell_price: '15.00',
          tecdoc_number: 'B',
        },
      ]);

      const result = await repository.findByTecdocNumbers(['A', 'B']);

      expect(result.get('A')).toHaveLength(2);
      expect(result.get('B')).toHaveLength(1);
      expect(result.get('A')?.[0].supplierSource).toBe('INTERCARS');
    });
  });
});
