import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from '../common';

export class DeliveryOfficeNotFoundException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, AppErrorCode.DELIVERY_OFFICE_NOT_FOUND);
  }
}

export class DeliveryOfficeRefusedException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      AppErrorCode.DELIVERY_OFFICE_REFUSED,
    );
  }
}

export class DeliveryAddressRefusedException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      AppErrorCode.DELIVERY_ADDRESS_REFUSED,
    );
  }
}

export class DeliveryAddressNotServedException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      AppErrorCode.DELIVERY_ADDRESS_NOT_SERVED,
    );
  }
}

export class DeliveryLockerIneligibleException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      AppErrorCode.DELIVERY_LOCKER_INELIGIBLE,
    );
  }
}

/** The courier could not be reached or failed on its side. Retryable. */
export class DeliveryUnavailableException extends AppHttpException {
  constructor() {
    super(HttpStatus.SERVICE_UNAVAILABLE, AppErrorCode.DELIVERY_UNAVAILABLE);
  }
}

/**
 * The courier refused the request itself: our credentials or a request we built.
 * Nothing the customer can fix, so it surfaces as a bare INTERNAL_ERROR.
 */
export class DeliveryRequestRejectedException extends AppHttpException {
  constructor() {
    super(HttpStatus.INTERNAL_SERVER_ERROR, AppErrorCode.INTERNAL_ERROR);
  }
}
