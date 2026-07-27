import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/**
 * Thrown when catalogue data could not be read because TecDoc is unreachable,
 * throttling us or failing. Maps to HTTP 503 / CATALOG_UNAVAILABLE so the
 * surface can offer "try again shortly" — the one thing it must not do is render
 * the empty result as "no such part", which is what an unclassified failure
 * would have produced.
 */
export class CatalogUnavailableException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: AppErrorCode.CATALOG_UNAVAILABLE,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * Thrown when TecDoc refused the call itself: our ProviderId, API key or IP
 * whitelisting is wrong, or we built a request it would not accept. Retrying
 * changes nothing and the cause is ours, so this is a bare HTTP 500 /
 * INTERNAL_ERROR — telling a browser that our upstream credentials are rejected
 * would leak how the integration is configured without helping anyone. The
 * actionable detail is logged instead.
 */
export class CatalogRequestRejectedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: AppErrorCode.INTERNAL_ERROR,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
