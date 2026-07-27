import { HttpStatus, NotFoundException } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/**
 * Thrown when TecDoc has no article under the requested number — a genuine,
 * permanent miss, as opposed to a read that failed. Extends NotFoundException so
 * it keeps HTTP 404 semantics, and carries ARTICLE_NOT_FOUND so the frontend can
 * show "we do not stock this part" instead of the generic not-found copy it would
 * get from an undeclared 404.
 */
export class ArticleNotFoundException extends NotFoundException {
  constructor() {
    super({
      statusCode: HttpStatus.NOT_FOUND,
      errorCode: AppErrorCode.ARTICLE_NOT_FOUND,
    });
  }
}
