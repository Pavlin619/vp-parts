import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/**
 * Thrown for someone Clerk has signed in who has no customer row yet: neither
 * the browser's filing call nor the webhook has landed. The browser answers by
 * filing them.
 */
export class CustomerProfileIncompleteException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        errorCode: AppErrorCode.CUSTOMER_PROFILE_INCOMPLETE,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/** Thrown when the email Clerk holds already belongs to another customer. */
export class EmailAlreadyExistsException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        errorCode: AppErrorCode.EMAIL_ALREADY_EXISTS,
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Thrown for a customer whose profile lacks a name or the phone that ordering
 * needs — someone who signed in with Google and has not completed it yet.
 */
export class CustomerDetailsRequiredException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: AppErrorCode.CUSTOMER_DETAILS_REQUIRED,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * Thrown when Clerk holds no email for the user — one created in the dashboard
 * without it. Retrying cannot fix that.
 */
export class ClerkIdentityIncompleteException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: AppErrorCode.VALIDATION_ERROR,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
