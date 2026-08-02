import { Injectable } from '@nestjs/common';
import { BrandDto } from '@vp-parts-shop/shared';
import { TecDocTransport } from '../../tecdoc';

/**
 * TecDoc `getBrands` source. The logo lives here but articles are fetched
 * elsewhere, so the brand -> logo join happens in {@link BrandsService}; this
 * class only fetches and maps the raw supplier list. Both sides key on
 * `dataSupplierId`, which is the same id an article row carries as `brandId`.
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
      // Optional throughout: TecDoc omits a collection rather than sending an
      // empty one, so every level here can be absent on a nothing-found result.
      data?: {
        array?: Array<{
          dataSupplierId: number;
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

    return (data.data?.array ?? []).map((brand) => ({
      brandId: String(brand.dataSupplierId),
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
