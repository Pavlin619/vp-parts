import { CartDto, CartLineDto } from '@vp-parts-shop/shared';
import { CartRecord } from './cart.repository';

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

function toCartLineDto(item: CartRecord['items'][number]): CartLineDto {
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
