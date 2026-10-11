import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/**
 * Thrown for someone Clerk has signed in who has no customer row: they
 * registered but the call that files them never landed. The UI answers by
 * asking for the phone again.
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
 * Thrown when Clerk holds no email or names for the user — the dashboard is
 * not requiring them at sign-up. Nothing the caller sends can fix that.
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
