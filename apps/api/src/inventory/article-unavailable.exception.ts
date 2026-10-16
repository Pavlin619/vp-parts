import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/** A selected part cannot be bought as it stands: out of stock, short of the quantity, or unpriced. */
export class ArticleUnavailableException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: AppErrorCode.ARTICLE_UNAVAILABLE,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
