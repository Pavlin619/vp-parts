import type { CarrierQuote } from './delivery-carrier';

/** The courier collects the parts, the delivery and its own fee for collecting them. */
export function amountToCollectCents(
  goodsCents: number,
  { priceIncVatCents, cashOnDeliveryFeeIncVatCents }: CarrierQuote,
): number {
  return goodsCents + priceIncVatCents + (cashOnDeliveryFeeIncVatCents ?? 0);
}
