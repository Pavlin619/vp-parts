import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from '../common';

/** A selected part cannot be bought as it stands: out of stock, short of the quantity, or unpriced. */
export class ArticleUnavailableException extends AppHttpException {
  constructor() {
    super(HttpStatus.UNPROCESSABLE_ENTITY, AppErrorCode.ARTICLE_UNAVAILABLE);
  }
}
