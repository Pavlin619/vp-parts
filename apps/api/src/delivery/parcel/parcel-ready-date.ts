import {
  articleIdentityKey,
  ArticleIdentityDto,
  selectWarehouseForQuantity,
} from '@vp-parts-shop/shared';
import type { AvailabilityByArticle } from '../../inventory';
import { shopDateOf } from '../shop-date';

export interface ReadyDateLine {
  article: ArticleIdentityDto;
  quantity: number;
}

/**
 * The shop-local day every line is at the shop, so the parcel can be handed to
 * the courier. Null when any line cannot be dated: no stock, or not enough of it.
 */
export function parcelReadyDate(
  lines: ReadyDateLine[],
  availability: AvailabilityByArticle,
): string | null {
  const lineDates = lines.map((line) => lineReadyDate(line, availability));

  if (lineDates.includes(null)) {
    return null;
  }

  return (lineDates as string[]).sort().at(-1) ?? null;
}

function lineReadyDate(
  { article, quantity }: ReadyDateLine,
  availability: AvailabilityByArticle,
): string | null {
  const warehouses =
    availability.get(articleIdentityKey(article.brandId, article.articleNumber))
      ?.availabilityByWarehouse ?? [];
  const stock = warehouses.reduce((sum, each) => sum + each.quantity, 0);

  if (stock < quantity) {
    return null;
  }

  const covering = selectWarehouseForQuantity(warehouses, quantity);

  return covering && shopDateOf(covering.pickup.earliestAt);
}
