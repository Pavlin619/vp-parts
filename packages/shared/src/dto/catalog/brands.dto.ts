/**
 * A parts brand (TecDoc data supplier) with its logo. The logo comes from the
 * TecDoc `getBrands` function (`dataSupplierLogo.imageURL*`); it is `null` when
 * TecDoc has no logo on file for that brand.
 */
export interface BrandDto {
  /** TecDoc `dataSupplierId` — the id article rows carry as `brandId`. */
  brandId: string;
  brandName: string;
  logoUrl: string | null;
}
