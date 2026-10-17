import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from '../common';

/** The named cart is not this customer's, or does not exist: a 404 either way, never a 403. */
export class OrderCartNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, AppErrorCode.NOT_FOUND);
  }
}

/** The live total is not the one the customer was shown. */
export class PriceChangedException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, AppErrorCode.PRICE_CHANGED);
  }
}

export class OrderNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, AppErrorCode.ORDER_NOT_FOUND);
  }
}
