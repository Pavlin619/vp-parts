import { articleIdentityKey } from '@vp-parts-shop/shared';
import { ArticleUnavailableException } from '../inventory';
import type { AvailabilityByArticle } from '../inventory';
import type { CarrierQuote } from './delivery-carrier';
import type { ReadyDateLine } from './parcel/parcel-ready-date';

/**
 * What the selected parts cost, at their live gross price. The courier collects
 * what an order would, so every line has to be orderable as it stands.
 */
export function goodsTotalIncVatCents(
  lines: ReadyDateLine[],
  availability: AvailabilityByArticle,
): number {
  return lines.reduce(
    (total, line) => total + lineTotalIncVatCents(line, availability),
    0,
  );
}

/** The courier collects the parts, the delivery and its own fee for collecting them. */
export function amountToCollectCents(
  goodsCents: number,
  { priceIncVatCents, cashOnDeliveryFeeIncVatCents }: CarrierQuote,
): number {
  return goodsCents + priceIncVatCents + (cashOnDeliveryFeeIncVatCents ?? 0);
}

function lineTotalIncVatCents(
  { article, quantity }: ReadyDateLine,
  availability: AvailabilityByArticle,
): number {
  const detail = availability.get(
    articleIdentityKey(article.brandId, article.articleNumber),
  );
  const stock = (detail?.availabilityByWarehouse ?? []).reduce(
    (sum, warehouse) => sum + warehouse.quantity,
    0,
  );

  if (
    !detail?.available ||
    detail.bestPriceIncVat === null ||
    stock < quantity
  ) {
    throw new ArticleUnavailableException();
  }

  return detail.bestPriceIncVat * quantity;
}
