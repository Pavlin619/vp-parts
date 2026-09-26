import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/**
 * Thrown when a cart already holding `MAX_CART_LINES` distinct parts is asked
 * to take one more.
 *
 * The limit is the batch the whole cart is priced by, so the refused line is
 * not the only casualty of exceeding it — every other line would go unpriced
 * too. Raising the quantity of a part already in the cart is always allowed:
 * it costs the batch nothing.
 */
export class CartFullException extends HttpException {
  constructor() {
    super(
      { statusCode: HttpStatus.CONFLICT, errorCode: AppErrorCode.CART_FULL },
      HttpStatus.CONFLICT,
    );
  }
}

/** Thrown when an action needs selected cart lines and the cart has none. */
export class CartEmptyException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: AppErrorCode.CART_EMPTY,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * Thrown when a line is patched that the cart no longer holds — usually a tab
 * acting on a cart another tab has already changed. The client answers by
 * re-reading the cart.
 */
export class CartItemNotFoundException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        errorCode: AppErrorCode.CART_ITEM_NOT_FOUND,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Thrown when adopting a guest cart finds the account cart changed between
 * the merge being computed and committed — another tab or device, signed into
 * the same account, wrote to it in between. The client answers by re-reading
 * the cart and retrying the adopt.
 */
export class CartMergeConflictException extends HttpException {
  constructor() {
    super(
      { statusCode: HttpStatus.CONFLICT, errorCode: AppErrorCode.CART_STALE },
      HttpStatus.CONFLICT,
    );
  }
}
