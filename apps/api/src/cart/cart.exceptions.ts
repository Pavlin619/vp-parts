import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from '../common';

/**
 * Thrown when a cart already holding `MAX_CART_LINES` distinct parts is asked
 * to take one more.
 *
 * The limit is the batch the whole cart is priced by, so the refused line is
 * not the only casualty of exceeding it — every other line would go unpriced
 * too. Raising the quantity of a part already in the cart is always allowed:
 * it costs the batch nothing.
 */
export class CartFullException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, AppErrorCode.CART_FULL);
  }
}

/** Thrown when an action needs selected cart lines and the cart has none. */
export class CartEmptyException extends AppHttpException {
  constructor() {
    super(HttpStatus.UNPROCESSABLE_ENTITY, AppErrorCode.CART_EMPTY);
  }
}

/**
 * Thrown when a line is patched that the cart no longer holds — usually a tab
 * acting on a cart another tab has already changed. The client answers by
 * re-reading the cart.
 */
export class CartItemNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, AppErrorCode.CART_ITEM_NOT_FOUND);
  }
}

/**
 * Thrown when a request acted on a cart that moved after it was read: edited
 * from another tab or device, ordered, or merged away. The client answers by
 * re-reading the cart and retrying.
 */
export class CartStaleException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, AppErrorCode.CART_STALE);
  }
}
