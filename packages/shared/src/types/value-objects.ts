export interface Money {
  cents: number;
  currency: 'EUR';
}

export type ArticleNumber = string & { readonly _brand: 'ArticleNumber' };

export type VehicleId = string & { readonly _brand: 'VehicleId' };
