import {
  ArticleIdentityDto,
  CartLineDto,
  MAX_CART_LINE_QUANTITY,
  MAX_CART_LINES,
  articleIdentityKey,
} from '@vp-parts-shop/shared';

export interface CartMergeResult {
  lines: CartLineDto[];
  /** Incoming lines there was no room for — reported, never dropped silently. */
  dropped: ArticleIdentityDto[];
}

const lineKey = (line: ArticleIdentityDto) =>
  articleIdentityKey(line.brandId, line.articleNumber);

/**
 * Unites two carts into one.
 *
 * A union, so an addition is never lost: that is the whole reason a cart is
 * worth merging rather than replacing, and it is what every large shop does
 * with a signed-in customer who had already filled a basket anonymously.
 *
 * Quantities are summed because each was a separate statement of how many the
 * customer wants. Whichever side is actually older keeps its reference price
 * and timestamp, so "the price has changed since you added this" still
 * answers from where the customer started — not from whichever cart the merge
 * happened to treat as the base.
 *
 * The union can be longer than one cart may be, because {@link MAX_CART_LINES}
 * is the batch the whole cart is priced by. The overflow is returned rather
 * than discarded, so the customer can be told which parts did not make it.
 */
export function mergeCartLines(
  existing: CartLineDto[],
  incoming: CartLineDto[],
): CartMergeResult {
  const lines = [...existing];
  const indexByKey = new Map(
    lines.map((line, index) => [lineKey(line), index]),
  );
  const dropped: ArticleIdentityDto[] = [];

  for (const line of oldestFirst(incoming)) {
    const key = lineKey(line);
    const index = indexByKey.get(key);

    if (index !== undefined) {
      lines[index] = raiseBy(lines[index], line);
      continue;
    }

    if (lines.length >= MAX_CART_LINES) {
      dropped.push({
        brandId: line.brandId,
        articleNumber: line.articleNumber,
      });
      continue;
    }

    indexByKey.set(key, lines.length);
    lines.push(line);
  }

  return { lines, dropped };
}

/** Oldest first, so the parts the customer has wanted longest survive a full cart. */
function oldestFirst(lines: CartLineDto[]): CartLineDto[] {
  return [...lines].sort((left, right) =>
    left.addedAt.localeCompare(right.addedAt),
  );
}

function raiseBy(existing: CartLineDto, incoming: CartLineDto): CartLineDto {
  const older =
    existing.addedAt.localeCompare(incoming.addedAt) <= 0 ? existing : incoming;

  return {
    ...older,
    quantity: Math.min(
      MAX_CART_LINE_QUANTITY,
      existing.quantity + incoming.quantity,
    ),
    isSelected: existing.isSelected || incoming.isSelected,
  };
}
