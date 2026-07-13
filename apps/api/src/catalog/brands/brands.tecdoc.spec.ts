import { TecDocTransport } from '../../tecdoc';
import { BrandsTecDoc } from './brands.tecdoc';

describe('BrandsTecDoc', () => {
  let call: jest.Mock;
  let tecdoc: BrandsTecDoc;

  beforeEach(() => {
    call = jest.fn();
    tecdoc = new BrandsTecDoc({ call } as unknown as TecDocTransport);
  });

  it('calls getBrands with includeAll and maps mfrName + preferred logo size', async () => {
    call.mockResolvedValueOnce({
      data: {
        array: [
          {
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
      includeAll: true,
    });
    // Prefers the 200px logo when present.
    expect(result).toEqual([
      { brandName: 'Bosch', logoUrl: 'https://logo/200.png' },
    ]);
  });

  it('falls back through logo sizes and to null when none are present', async () => {
    call.mockResolvedValueOnce({
      data: {
        array: [
          { mfrName: 'A', dataSupplierLogo: { imageURL800: 'https://a/800' } },
          { mfrName: 'B' },
        ],
      },
    });

    const result = await tecdoc.getBrands();

    expect(result).toEqual([
      { brandName: 'A', logoUrl: 'https://a/800' },
      { brandName: 'B', logoUrl: null },
    ]);
  });
});
