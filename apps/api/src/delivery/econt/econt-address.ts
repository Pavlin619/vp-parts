import type { DeliveryAddressDto } from '@vp-parts-shop/shared';

/** The address as Econt's services take it; the street number is its `num`. */
export function econtAddressOf({
  placeId,
  street,
  streetNumber,
  quarter,
  other,
}: DeliveryAddressDto): object {
  return {
    city: { id: Number(placeId) },
    ...(street && { street }),
    ...(streetNumber && { num: streetNumber }),
    ...(quarter && { quarter }),
    ...(other && { other }),
  };
}
