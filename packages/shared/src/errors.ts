/**
 * The complete set of error codes the API may return. The frontend maps each one
 * to a localised message, so a code is only worth adding when the UI would say
 * something different because of it.
 *
 * Deliberately coarse where the caller cannot act on the difference: a wrong
 * TecDoc API key, a non-whitelisted IP and a malformed upstream request all
 * surface as INTERNAL_ERROR, because none of them are the user's to fix and
 * naming them in a response body would leak how our integration is configured.
 * That detail belongs in the server logs.
 */
export enum AppErrorCode {
  /** Request rejected at the validation boundary. The caller sent bad input. */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  /** Throttled by our own rate limiter. The caller may retry after a pause. */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Anything unexpected. Never carries detail — see the note above. */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  ARTICLE_NOT_FOUND = 'ARTICLE_NOT_FOUND',
  ARTICLE_UNAVAILABLE = 'ARTICLE_UNAVAILABLE',
  PRICE_CHANGED = 'PRICE_CHANGED',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  ORDER_CANNOT_BE_CANCELLED = 'ORDER_CANNOT_BE_CANCELLED',
  CART_ITEM_NOT_FOUND = 'CART_ITEM_NOT_FOUND',
  QUANTITY_EXCEEDS_STOCK = 'QUANTITY_EXCEEDS_STOCK',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  MECHANIC_APPLICATION_ALREADY_EXISTS = 'MECHANIC_APPLICATION_ALREADY_EXISTS',
  COD_THRESHOLD_EXCEEDED = 'COD_THRESHOLD_EXCEEDED',
  /** Price/availability could not be read. Retryable. */
  INVENTORY_UNAVAILABLE = 'INVENTORY_UNAVAILABLE',
  /** Catalogue data (TecDoc) could not be read. Retryable. */
  CATALOG_UNAVAILABLE = 'CATALOG_UNAVAILABLE',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
}

export interface ApiErrorResponse {
  statusCode: number;
  errorCode: AppErrorCode;
}
