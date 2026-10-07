import { PacedTecDoc } from './paced-tecdoc';
import { ProductType, ProductTypeCatalogue } from './product-type-catalogue';

const articles = (brandId: number, ...numbers: string[]) =>
  numbers.map((articleNumber) => ({ articleNumber, dataSupplierId: brandId }));

describe('ProductTypeCatalogue', () => {
  const call = jest.fn();
  const catalogue = new ProductTypeCatalogue({
    call,
  } as unknown as PacedTecDoc);
  const OUR_BRANDS = [1, 2, 3];

  beforeEach(() => call.mockReset());

  it('lists every product type our brands have, with its article count', async () => {
    call.mockResolvedValueOnce({
      genericArticleFacets: {
        counts: [
          {
            genericArticleId: 7,
            genericArticleDescription: 'Маслен филтър',
            count: 40,
          },
        ],
      },
    });

    const types = await catalogue.listProductTypes(OUR_BRANDS);

    expect(types).toEqual([
      { genericArticleId: 7, name: expect.any(String), articleCount: 40 },
    ]);
    expect(call).toHaveBeenCalledWith(
      'getArticles',
      expect.objectContaining({
        dataSupplierIds: OUR_BRANDS,
        perPage: 0,
        includeGenericArticleFacets: true,
      }),
    );
  });

  it('is empty when TecDoc omits the facet', async () => {
    call.mockResolvedValueOnce({});

    await expect(catalogue.listProductTypes(OUR_BRANDS)).resolves.toEqual([]);
  });

  it('reads a small type whole in one call, without include flags', async () => {
    const type: ProductType = {
      genericArticleId: 7,
      name: 'x',
      articleCount: 1000,
    };
    call.mockResolvedValueOnce({ articles: articles(1, 'A', 'B') });

    const identities = await catalogue.readArticles(
      type,
      OUR_BRANDS,
      new Map(),
    );

    expect(identities).toEqual([
      { brandId: '1', articleNumber: 'A' },
      { brandId: '1', articleNumber: 'B' },
    ]);
    expect(call).toHaveBeenCalledTimes(1);
    const params = call.mock.calls[0][1];
    expect(params).toMatchObject({
      genericArticleIds: [7],
      dataSupplierIds: OUR_BRANDS,
      perPage: 1000,
    });
    expect(
      Object.keys(params).filter((key) => key.startsWith('include')),
    ).toEqual([]);
  });

  it('reads a big type by facet, then through the 10 best-weighed brands', async () => {
    const type: ProductType = {
      genericArticleId: 82,
      name: 'x',
      articleCount: 5000,
    };
    const brandIds = Array.from({ length: 12 }, (_, index) => index + 1);
    const weighedCounts = new Map(brandIds.map((id) => [id, id * 10]));
    call.mockResolvedValueOnce({
      dataSupplierFacets: {
        counts: brandIds.map((dataSupplierId) => ({
          dataSupplierId,
          count: 5,
        })),
      },
    });
    call.mockImplementation((_function, params) =>
      Promise.resolve({ articles: articles(params.dataSupplierIds[0], 'N') }),
    );

    const identities = await catalogue.readArticles(
      type,
      brandIds,
      weighedCounts,
    );

    expect(call).toHaveBeenCalledTimes(11);
    expect(call.mock.calls[0][1]).toMatchObject({
      perPage: 0,
      includeDataSupplierFacets: true,
    });
    const readBrands = call.mock.calls
      .slice(1)
      .map(([, params]) => params.dataSupplierIds);
    expect(readBrands).toEqual([
      [12],
      [11],
      [10],
      [9],
      [8],
      [7],
      [6],
      [5],
      [4],
      [3],
    ]);
    expect(call.mock.calls[1][1]).toMatchObject({
      perPage: 100,
      genericArticleIds: [82],
    });
    expect(identities).toHaveLength(10);
  });

  it('keeps one identity when TecDoc repeats an article', async () => {
    const type: ProductType = {
      genericArticleId: 7,
      name: 'x',
      articleCount: 3,
    };
    call.mockResolvedValueOnce({ articles: articles(1, 'A', 'A') });

    await expect(
      catalogue.readArticles(type, OUR_BRANDS, new Map()),
    ).resolves.toHaveLength(1);
  });
});
