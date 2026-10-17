import { ArticleIdentityDto, articleIdentityKey } from '@vp-parts-shop/shared';
import { ArticleUnavailableException } from './article-unavailable.exception';
import type { AvailabilityByArticle } from './inventory.service';

export interface OrderableLine {
  article: ArticleIdentityDto;
  quantity: number;
}

/**
 * The live gross unit price a line can be ordered at. Null when it cannot be:
 * out of stock, short of its quantity, or unpriced. The one rule the cart
 * totals, the delivery quote and the order all apply.
 */
export function orderableUnitPrice(
  { article, quantity }: OrderableLine,
  availability: AvailabilityByArticle,
): number | null {
  const detail = availability.get(
    articleIdentityKey(article.brandId, article.articleNumber),
  );
  const stock = (detail?.availabilityByWarehouse ?? []).reduce(
    (sum, warehouse) => sum + warehouse.quantity,
    0,
  );

  if (!detail?.available || stock < quantity) {
    return null;
  }

  return detail.bestPriceIncVat;
}

export type PricedLine<T extends OrderableLine = OrderableLine> = T & {
  unitPrice: number;
};

export interface PricedLines<T extends OrderableLine> {
  priced: PricedLine<T>[];
  unorderable: T[];
}

/** Each line at its orderable unit price, with the lines that cannot be ordered set apart. */
export function priceLines<T extends OrderableLine>(
  lines: T[],
  availability: AvailabilityByArticle,
): PricedLines<T> {
  const result: PricedLines<T> = { priced: [], unorderable: [] };

  for (const line of lines) {
    const unitPrice = orderableUnitPrice(line, availability);

    if (unitPrice === null) {
      result.unorderable.push(line);
    } else {
      result.priced.push({ ...line, unitPrice });
    }
  }

  return result;
}

/** Every line priced, or refused: an order cannot leave a line behind. */
export function requirePricedLines<T extends OrderableLine>(
  lines: T[],
  availability: AvailabilityByArticle,
): PricedLine<T>[] {
  const { priced, unorderable } = priceLines(lines, availability);

  if (unorderable.length > 0) {
    throw new ArticleUnavailableException();
  }

  return priced;
}
