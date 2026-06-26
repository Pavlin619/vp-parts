import { AutopartsRepository } from './autoparts.repository';
import { PrismaService } from '../prisma';

const queryRaw = jest.fn();
const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

describe('AutopartsRepository', () => {
  let repository: AutopartsRepository;

  beforeEach(() => {
    repository = new AutopartsRepository(prisma);
    jest.clearAllMocks();
  });

  describe('findByTecdocNumber', () => {
    it('maps raw rows to integer-cent rows using net and gross prices directly', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          tecdoc_number: '0986478451',
          available_quantity: 7,
          sell_price_net: '50.00',
          gross_price: '60.00',
        },
      ]);

      const rows = await repository.findByTecdocNumber('0986478451');

      expect(rows).toEqual([
        {
          tecdocNumber: '0986478451',
          availableQuantity: 7,
          sellPriceExVatCents: 5000,
          sellPriceIncVatCents: 6000,
        },
      ]);
    });

    it('coerces null quantity/prices defensively', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          tecdoc_number: 'X',
          available_quantity: null,
          sell_price_net: null,
          gross_price: null,
        },
      ]);

      const [row] = await repository.findByTecdocNumber('X');

      expect(row.availableQuantity).toBe(0);
      expect(row.sellPriceExVatCents).toBe(0);
      expect(row.sellPriceIncVatCents).toBe(0);
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
          tecdoc_number: 'A',
          available_quantity: 2,
          sell_price_net: '50.00',
          gross_price: '60.00',
        },
        {
          tecdoc_number: 'B',
          available_quantity: 0,
          sell_price_net: '10.00',
          gross_price: '12.00',
        },
      ]);

      const result = await repository.findByTecdocNumbers(['A', 'B']);

      expect(result.get('A')?.[0].availableQuantity).toBe(2);
      expect(result.get('B')?.[0].sellPriceIncVatCents).toBe(1200);
    });
  });
});
