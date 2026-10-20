import type { ConfigService } from '@nestjs/config';

/** Who sells, as consumer law asks every confirmation to say (ЗЗП чл. 47). */
export interface Seller {
  /** The legal name, with its form (ЕООД, ООД). */
  name: string;
  /** ЕИК. */
  companyId: string;
  address: string;
  email: string;
  phone: string;
}

export interface ShopDetails {
  seller: Seller;
  /** Where the web app is served; every link in an email starts here. */
  webOrigin: string;
}

export function shopDetailsFrom(config: ConfigService): ShopDetails {
  const read = (key: string) => config.get<string>(key)!;

  return {
    seller: {
      name: read('SELLER_NAME'),
      companyId: read('SELLER_COMPANY_ID'),
      address: read('SELLER_ADDRESS'),
      email: read('SELLER_EMAIL'),
      phone: read('SELLER_PHONE'),
    },
    webOrigin: read('CORS_ORIGIN'),
  };
}
