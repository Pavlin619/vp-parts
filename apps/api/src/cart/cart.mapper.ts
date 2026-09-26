import {
  ArticleIdentityDto,
  CartDto,
  CartLineDto,
} from '@vp-parts-shop/shared';
import type { ShippingProfile } from '../tecdoc';
import { fromShippingColumns } from './cart-shipping';
import { CartRecord } from './cart.repository';

type CartItemRecord = CartRecord['items'][number];

/** A line as the cart stores it: the wire fields plus what only the API reads. */
export interface StoredCartLine extends CartLineDto {
  shippingProfile: ShippingProfile;
}

/** What a selected line weighs, for the delivery module to build a parcel from. */
export interface CartShippingLine {
  article: ArticleIdentityDto;
  quantity: number;
  shippingProfile: ShippingProfile;
}

/**
 * A stored cart as the wire carries it.
 *
 * Nothing is computed here and nothing is priced: a cart response is the
 * customer's intent, and every figure shown beside it is read live from
 * inventory by the surface that renders it.
 */
export function toCartDto(cart: CartRecord): CartDto {
  return {
    id: cart.id,
    version: cart.version,
    lines: cart.items.map(toCartLineDto),
  };
}

export function toStoredCartLines(cart: CartRecord): StoredCartLine[] {
  return cart.items.map((item) => ({
    ...toCartLineDto(item),
    shippingProfile: fromShippingColumns(item),
  }));
}

export function toSelectedShippingLines(cart: CartRecord): CartShippingLine[] {
  return cart.items
    .filter((item) => item.isSelected)
    .map((item) => ({
      article: { brandId: item.brandId, articleNumber: item.articleNumber },
      quantity: item.quantity,
      shippingProfile: fromShippingColumns(item),
    }));
}

function toCartLineDto(item: CartItemRecord): CartLineDto {
  return {
    brandId: item.brandId,
    articleNumber: item.articleNumber,
    brandName: item.brandName,
    brandLogoUrl: item.brandLogoUrl,
    description: item.description,
    thumbnailUrl: item.thumbnailUrl,
    quantity: item.quantity,
    isSelected: item.isSelected,
    addedAtPriceIncVat: item.addedAtPriceIncVat,
    addedAt: item.addedAt.toISOString(),
  };
}
