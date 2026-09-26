import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

function errorBody(statusCode: HttpStatus, errorCode: AppErrorCode) {
  return { statusCode, errorCode };
}

export class DeliveryOfficeNotFoundException extends HttpException {
  constructor() {
    super(
      errorBody(HttpStatus.NOT_FOUND, AppErrorCode.DELIVERY_OFFICE_NOT_FOUND),
      HttpStatus.NOT_FOUND,
    );
  }
}

export class DeliveryOfficeRefusedException extends HttpException {
  constructor() {
    super(
      errorBody(
        HttpStatus.UNPROCESSABLE_ENTITY,
        AppErrorCode.DELIVERY_OFFICE_REFUSED,
      ),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class DeliveryLockerIneligibleException extends HttpException {
  constructor() {
    super(
      errorBody(
        HttpStatus.UNPROCESSABLE_ENTITY,
        AppErrorCode.DELIVERY_LOCKER_INELIGIBLE,
      ),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class DeliveryParcelUnmeasuredException extends HttpException {
  constructor() {
    super(
      errorBody(
        HttpStatus.UNPROCESSABLE_ENTITY,
        AppErrorCode.DELIVERY_PARCEL_UNMEASURED,
      ),
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** The courier could not be reached or failed on its side. Retryable. */
export class DeliveryUnavailableException extends HttpException {
  constructor() {
    super(
      errorBody(
        HttpStatus.SERVICE_UNAVAILABLE,
        AppErrorCode.DELIVERY_UNAVAILABLE,
      ),
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/**
 * The courier refused the request itself: our credentials or a request we built.
 * Nothing the customer can fix, so it surfaces as a bare INTERNAL_ERROR.
 */
export class DeliveryRequestRejectedException extends HttpException {
  constructor() {
    super(
      errorBody(HttpStatus.INTERNAL_SERVER_ERROR, AppErrorCode.INTERNAL_ERROR),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
