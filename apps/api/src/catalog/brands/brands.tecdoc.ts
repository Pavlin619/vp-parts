import { Injectable } from '@nestjs/common';
import { BrandDto } from '@vp-parts-shop/shared';
import { TecDocTransport } from '../../tecdoc';

/**
 * TecDoc `getBrands` source. TecDoc keys articles by brand name (`mfrName`), not
 * by logo, so the brand -> logo join happens in {@link BrandsService}; this
 * class only fetches and maps the raw supplier list.
 */
@Injectable()
export class BrandsTecDoc {
  constructor(private readonly transport: TecDocTransport) {}

  /**
   * All parts brands with their logo URLs. `includeAll` makes TecDoc attach the
   * `dataSupplierLogo` block; we pick a mid-resolution image and fall back
   * through the other sizes.
   */
  async getBrands(): Promise<BrandDto[]> {
    const data = await this.transport.call<{
      data: {
        array: Array<{
          mfrName: string;
          dataSupplierLogo?: {
            imageURL100?: string;
            imageURL200?: string;
            imageURL400?: string;
            imageURL800?: string;
          };
        }>;
      };
    }>('getBrands', {
      articleCountry: 'BG',
      lang: 'bg',
      includeAll: true,
    });

    return data.data.array.map((brand) => ({
      brandName: brand.mfrName,
      logoUrl:
        brand.dataSupplierLogo?.imageURL200 ??
        brand.dataSupplierLogo?.imageURL400 ??
        brand.dataSupplierLogo?.imageURL100 ??
        brand.dataSupplierLogo?.imageURL800 ??
        null,
    }));
  }
}
