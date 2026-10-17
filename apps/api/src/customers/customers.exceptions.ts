import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from '../common';

/**
 * Thrown for someone Clerk has signed in who has no customer row yet: neither
 * the browser's filing call nor the webhook has landed. The browser answers by
 * filing them.
 */
export class CustomerProfileIncompleteException extends AppHttpException {
  constructor() {
    super(HttpStatus.NOT_FOUND, AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE);
  }
}

/** Thrown when the email Clerk holds already belongs to another customer. */
export class EmailAlreadyExistsException extends AppHttpException {
  constructor() {
    super(HttpStatus.CONFLICT, AppErrorCode.EMAIL_ALREADY_EXISTS);
  }
}

/**
 * Thrown for a customer whose profile lacks a name or the phone that ordering
 * needs — someone who signed in with Google and has not completed it yet.
 */
export class CustomerDetailsRequiredException extends AppHttpException {
  constructor() {
    super(
      HttpStatus.UNPROCESSABLE_ENTITY,
      AppErrorCode.CUSTOMER_DETAILS_REQUIRED,
    );
  }
}

/**
 * Thrown when Clerk holds no email for the user — one created in the dashboard
 * without it. Retrying cannot fix that.
 */
export class ClerkIdentityIncompleteException extends AppHttpException {
  constructor() {
    super(HttpStatus.UNPROCESSABLE_ENTITY, AppErrorCode.VALIDATION_ERROR);
  }
}
