import { ArticleIdentityDto, AVAILABILITY_MAX_ARTICLES } from './inventory.dto';

/**
 * One line of a cart, as the server holds it.
 *
 * Intent only: which part, how many, and whether it is to be ordered. The
 * catalog fields are a snapshot of what the customer saw when they added the
 * line, so a row paints without a second read and still names the part if the
 * catalogue later drops it.
 *
 * No price, no stock, no delivery date. Every figure on a cart surface is read
 * live — a number saved yesterday is the one thing a cart must not show. The
 * single exception is {@link addedAtPriceIncVat}, which exists to be compared
 * and never to be displayed as the price.
 */
export interface CartLineDto extends ArticleIdentityDto {
  brandName: string;
  brandLogoUrl: string | null;
  description: string;
  thumbnailUrl: string | null;
  quantity: number;
  /** Whether this line is to be ordered. Everything added starts selected. */
  isSelected: boolean;
  /**
   * Inc-VAT cents at the moment the line was added, so the cart can say the
   * price has moved since. Null when the add happened without a live price.
   */
  addedAtPriceIncVat: number | null;
  addedAt: string;
}

/**
 * A cart, keyed by its own id rather than by its owner: the same shape serves a
 * guest holding a cart token and a signed-in customer.
 *
 * `version` rises on every mutation. Checkout pins the version it priced, so an
 * order can refuse a cart that moved between the quote and the commitment.
 */
export interface CartDto {
  id: string;
  version: number;
  lines: CartLineDto[];
}

/** An empty cart, which is what a visitor who has never added anything has. */
export const EMPTY_CART: CartDto = { id: '', version: 0, lines: [] };

export interface CartAdoptResponseDto {
  cart: CartDto;
  /**
   * Lines the merge could not keep, because the union of the two carts was
   * longer than {@link MAX_CART_LINES}. Shown to the customer rather than
   * dropped in silence.
   */
  droppedLines: ArticleIdentityDto[];
}

/**
 * Most lines one cart may hold.
 *
 * Every line on a cart surface is priced by one batch availability request, and
 * that endpoint refuses a batch over {@link AVAILABILITY_MAX_ARTICLES} — so a
 * cart past the cap would price not some of its lines but none of them. Shared
 * because both sides have to agree: the browser stops offering to add, and the
 * server refuses the line that would break the batch.
 */
export const MAX_CART_LINES = AVAILABILITY_MAX_ARTICLES;

/**
 * Absolute ceiling for one line's quantity, whatever the stock. Shared so the
 * stepper and the server clamp to the same number.
 */
export const MAX_CART_LINE_QUANTITY = 99;
