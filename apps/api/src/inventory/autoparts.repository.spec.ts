import { articleIdentityKey } from '@vp-parts-shop/shared';
import { AutopartsRepository } from './autoparts.repository';
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

describe('AutopartsRepository', () => {
  let repository: AutopartsRepository;

  beforeEach(() => {
    repository = new AutopartsRepository(prisma);
    jest.clearAllMocks();
  });

  describe('findByArticle', () => {
    it('maps raw rows to integer-cent rows using net and gross prices directly', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          tecdoc_number: '0986478451',
          tecdoc_supplier_id: BOSCH,
          available_quantity: 7,
          sell_price_net: '50.00',
          gross_price: '60.00',
        },
      ]);

      const rows = await repository.findByArticle({
        brandId: BOSCH,
        articleNumber: '0986478451',
      });

      expect(rows).toEqual([
        {
          tecdocNumber: '0986478451',
          brandId: BOSCH,
          availableQuantity: 7,
          sellPriceExVatCents: 5000,
          sellPriceIncVatCents: 6000,
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

    it('coerces null quantity/prices defensively', async () => {
      queryRaw.mockResolvedValueOnce([
        {
          tecdoc_number: 'X',
          tecdoc_supplier_id: BOSCH,
          available_quantity: null,
          sell_price_net: null,
          gross_price: null,
        },
      ]);

      const [row] = await repository.findByArticle({
        brandId: BOSCH,
        articleNumber: 'X',
      });

      expect(row.availableQuantity).toBe(0);
      expect(row.sellPriceExVatCents).toBe(0);
      expect(row.sellPriceIncVatCents).toBe(0);
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
          tecdoc_number: 'A',
          tecdoc_supplier_id: BOSCH,
          available_quantity: 2,
          sell_price_net: '50.00',
          gross_price: '60.00',
        },
        {
          tecdoc_number: 'A',
          tecdoc_supplier_id: SPIDAN,
          available_quantity: 0,
          sell_price_net: '10.00',
          gross_price: '12.00',
        },
      ]);

      const result = await repository.findByArticles([
        { brandId: BOSCH, articleNumber: 'A' },
        { brandId: SPIDAN, articleNumber: 'A' },
      ]);

      expect(
        result.get(articleIdentityKey(BOSCH, 'A'))?.[0].availableQuantity,
      ).toBe(2);
      expect(
        result.get(articleIdentityKey(SPIDAN, 'A'))?.[0].sellPriceIncVatCents,
      ).toBe(1200);
    });
  });
});
