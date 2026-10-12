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
 * Thrown when Clerk holds no valid phone in the user's registration metadata —
 * typically someone who signed in through Google or Facebook. The browser asks
 * them for one, stores it in the metadata and files them again.
 */
export class CustomerPhoneRequiredException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: AppErrorCode.CUSTOMER_PHONE_REQUIRED,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/**
 * Thrown when Clerk holds no email or names for the user — the dashboard is
 * not requiring them. Retrying cannot fix that.
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
