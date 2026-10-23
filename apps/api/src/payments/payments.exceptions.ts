import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from '../common';

export class PaymentUnavailableException extends AppHttpException {
  constructor() {
    super(HttpStatus.SERVICE_UNAVAILABLE, AppErrorCode.PAYMENT_UNAVAILABLE);
  }
}
