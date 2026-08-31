import { TecDocTransport } from '../../tecdoc';
import { BrandsTecDoc } from './brands.tecdoc';

describe('BrandsTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: BrandsTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new BrandsTecDoc({ call } as unknown as TecDocTransport);
  });

  it('asks only for the logo block and maps the id, name and preferred size', async () => {
    call.mockResolvedValueOnce({
      data: {
        array: [
          {
            dataSupplierId: 30,
            mfrName: 'Bosch',
            dataSupplierLogo: {
              imageURL100: 'https://logo/100.png',
              imageURL200: 'https://logo/200.png',
              imageURL400: 'https://logo/400.png',
            },
          },
        ],
      },
    });

    const result = await tecdoc.getBrands();

    expect(call).toHaveBeenCalledWith('getBrands', {
      articleCountry: 'BG',
      lang: 'bg',
      includeDataSupplierLogo: true,
    });
    // Prefers the 200px logo when present. The id is what article rows join on,
    // so it has to survive the mapping as well as the name.
    expect(result).toEqual([
      { brandId: '30', brandName: 'Bosch', logoUrl: 'https://logo/200.png' },
    ]);
  });

  it('falls back through logo sizes and to null when none are present', async () => {
    call.mockResolvedValueOnce({
      data: {
        array: [
          {
            dataSupplierId: 1,
            mfrName: 'A',
            dataSupplierLogo: { imageURL800: 'https://a/800' },
          },
          { dataSupplierId: 2, mfrName: 'B' },
        ],
      },
    });

    const result = await tecdoc.getBrands();

    expect(result).toEqual([
      { brandId: '1', brandName: 'A', logoUrl: 'https://a/800' },
      { brandId: '2', brandName: 'B', logoUrl: null },
    ]);
  });

  // TecDoc omits a collection rather than sending an empty one, at every level.
  it.each([
    ['the whole data block', { status: 200 }],
    ['just the array', { data: {}, status: 200 }],
  ])('returns an empty list when TecDoc omits %s', async (_label, payload) => {
    call.mockResolvedValueOnce(payload);

    await expect(tecdoc.getBrands()).resolves.toEqual([]);
  });
});
