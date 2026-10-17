import { HttpException, HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';

/** A domain error as the error contract carries it: a status and a code, never a message. */
export class AppHttpException extends HttpException {
  constructor(statusCode: HttpStatus, errorCode: AppErrorCode) {
    super({ statusCode, errorCode }, statusCode);
  }
}
