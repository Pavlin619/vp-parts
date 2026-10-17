import { HttpStatus } from '@nestjs/common';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { AppHttpException } from './app-http.exception';

describe('AppHttpException', () => {
  it('carries the status and the code, and nothing else', () => {
    const exception = new AppHttpException(
      HttpStatus.CONFLICT,
      AppErrorCode.CART_STALE,
    );

    expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(exception.getResponse()).toEqual({
      statusCode: HttpStatus.CONFLICT,
      errorCode: AppErrorCode.CART_STALE,
    });
  });
});
