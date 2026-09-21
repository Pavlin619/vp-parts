import type { ArticlesAvailabilityDto } from "@vp-parts-shop/shared";
import type { CartLine } from "@/hooks/use-cart";
import {
  selectArticleAvailability,
  type RowAvailability,
} from "@/lib/inventory/merge-availability";
import { MAX_QUANTITY, summariseWarehouses } from "@/lib/delivery/availability";

/** Why a line cannot be ordered as it stands. */
export type CartLineIssue = "unavailable" | "insufficient-stock";

/**
 * One cart line joined to the live availability read — the whole model a cart
 * row renders from. Prices are in cents and are `null` whenever the read has
 * not landed, failed, or priced that part, so a row can tell "unknown" from
 * "free" and the summary can leave it out of the totals.
 */
export interface CartRowModel {
  line: CartLine;
  availability: RowAvailability;
  unitPriceExVat: number | null;
  unitPriceIncVat: number | null;
  lineTotalExVat: number | null;
  lineTotalIncVat: number | null;
  /** Why the line cannot be ordered as it stands; null when it can. */
  issue: CartLineIssue | null;
  /** Pieces we hold, or null wherever the read cannot say. */
  availableQuantity: number | null;
  /** Highest quantity the row's stepper offers. */
  maxQuantity: number;
  /**
   * How far the unit price has moved, in cents, since the part went into the
   * cart — positive for a rise. Null when nothing has changed, or when either
   * end of the comparison is missing.
   */
  priceChange: number | null;
}

export interface CartTotals {
  /** Pieces across every line, priced or not — what "N артикула" counts. */
  itemCount: number;
  subtotalExVat: number;
  vatAmount: number;
  totalIncVat: number;
  /**
   * True when at least one line carries no price, so the totals describe only
   * part of the cart and the summary has to say so.
   */
  hasUnpricedLines: boolean;
  /**
   * True when at least one line cannot be ordered as it stands. The customer
   * resolves it by lowering the quantity, dropping the line or deselecting it;
   * until then there is nothing to carry into checkout.
   */
  hasBlockedLines: boolean;
}

/**
 * Pieces behind one line, or null wherever the read cannot say: in flight,
 * failed, or resolved without a per-warehouse breakdown.
 *
 * Null is not zero. An empty warehouse list on an in-stock part means we cannot
 * see the depth, so reading it as "none" would warn about a part that is fine
 * and pin its stepper to a figure we never received.
 */
function availableQuantityOf(detail: RowAvailability): number | null {
  if (!detail) {
    return null;
  }

  if (!detail.available) {
    return 0;
  }

  const { totalQuantity } = summariseWarehouses(detail.availabilityByWarehouse);

  return totalQuantity > 0 ? totalQuantity : null;
}

function lineIssueOf(
  availableQuantity: number | null,
  quantity: number,
): CartLineIssue | null {
  if (availableQuantity === null) {
    return null;
  }

  if (availableQuantity === 0) {
    return "unavailable";
  }

  return availableQuantity < quantity ? "insufficient-stock" : null;
}

/**
 * How far the price has moved since the line was added.
 *
 * Null rather than zero for "it has not moved", so a row asks one question —
 * is there something to say? — instead of comparing to zero itself. A line
 * added while the price read was failing has nothing to compare against.
 */
function priceChangeOf(
  addedAtPriceIncVat: number | null,
  unitPriceIncVat: number | null,
): number | null {
  if (addedAtPriceIncVat === null || unitPriceIncVat === null) {
    return null;
  }

  const change = unitPriceIncVat - addedAtPriceIncVat;

  return change === 0 ? null : change;
}

/**
 * Joins the stored lines to a batch availability read, in the cart's own order.
 *
 * A line the read had no row for degrades to the neutral unavailable state
 * rather than dropping out — a part that went out of stock has to stay visible
 * for the customer to act on, not quietly vanish from the cart they built.
 */
export function buildCartRows(
  lines: CartLine[],
  availability: ArticlesAvailabilityDto | null | undefined,
): CartRowModel[] {
  return lines.map((line) => {
    const detail = selectArticleAvailability(availability, line);
    const unitPriceExVat = detail?.bestPriceExVat ?? null;
    const unitPriceIncVat = detail?.bestPriceIncVat ?? null;

    // Both halves or neither: the summary derives VAT as the difference
    // between them, and a line contributing to one side only would report a
    // VAT figure that is really a missing net price.
    const isPriced = unitPriceExVat != null && unitPriceIncVat != null;

    const availableQuantity = availableQuantityOf(detail);

    return {
      line,
      availability: detail,
      unitPriceExVat: isPriced ? unitPriceExVat : null,
      unitPriceIncVat: isPriced ? unitPriceIncVat : null,
      lineTotalExVat: isPriced ? unitPriceExVat * line.quantity : null,
      lineTotalIncVat: isPriced ? unitPriceIncVat * line.quantity : null,
      issue: lineIssueOf(availableQuantity, line.quantity),
      priceChange: priceChangeOf(
        line.addedAtPriceIncVat,
        isPriced ? unitPriceIncVat : null,
      ),
      availableQuantity,
      maxQuantity:
        availableQuantity === null
          ? MAX_QUANTITY
          : Math.min(availableQuantity, MAX_QUANTITY),
    };
  });
}

/**
 * The summary figures. VAT is the difference between the gross and net sums
 * rather than a percentage applied here — the rate is the backoffice's to set,
 * and re-deriving it in the browser is how a cart ends up disagreeing with the
 * order it becomes.
 */
export function cartTotals(rows: CartRowModel[]): CartTotals {
  const itemCount = rows.reduce((total, row) => total + row.line.quantity, 0);

  // Only lines we could actually ship carry money. The API quotes our own
  // catalogue price for a part it holds no stock for, so a part we cannot
  // supply arrives priced — summing it would quote a total no order can match.
  const orderable = rows.filter((row) => row.issue === null);

  const subtotalExVat = orderable.reduce(
    (total, row) => total + (row.lineTotalExVat ?? 0),
    0,
  );

  const totalIncVat = orderable.reduce(
    (total, row) => total + (row.lineTotalIncVat ?? 0),
    0,
  );

  return {
    itemCount,
    subtotalExVat,
    vatAmount: totalIncVat - subtotalExVat,
    totalIncVat,
    hasUnpricedLines: orderable.some((row) => row.lineTotalIncVat == null),
    hasBlockedLines: rows.some((row) => row.issue !== null),
  };
}
