import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppErrorCode } from '@vp-parts-shop/shared';
import { GlobalExceptionFilter } from './exception.filter';

interface CapturedResponse {
  statusCode?: number;
  body?: unknown;
}

function hostFor(captured: CapturedResponse): ArgumentsHost {
  const response = {
    status(statusCode: number) {
      captured.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
    },
  };

  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/catalog/articles/A1' }),
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let captured: CapturedResponse;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    captured = {};
    jest.spyOn(filter['logger'], 'warn').mockImplementation();
    jest.spyOn(filter['logger'], 'error').mockImplementation();
  });

  function handle(exception: unknown) {
    filter.catch(exception, hostFor(captured));
    return captured;
  }

  it('uses the error code an exception declares', () => {
    const declared = new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: AppErrorCode.CATALOG_UNAVAILABLE,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );

    expect(handle(declared)).toEqual({
      statusCode: 503,
      body: { statusCode: 503, errorCode: AppErrorCode.CATALOG_UNAVAILABLE },
    });
  });

  // The headline fix: an unhandled throw is a server fault, and reporting it as
  // VALIDATION_ERROR sent the caller hunting for a mistake in their own request.
  it('reports an unhandled exception as a 500 INTERNAL_ERROR', () => {
    expect(handle(new Error('redis exploded'))).toEqual({
      statusCode: 500,
      body: { statusCode: 500, errorCode: AppErrorCode.INTERNAL_ERROR },
    });
  });

  it('reports a non-Error throw as a 500 INTERNAL_ERROR', () => {
    expect(handle('a string')).toEqual({
      statusCode: 500,
      body: { statusCode: 500, errorCode: AppErrorCode.INTERNAL_ERROR },
    });
  });

  it('never leaks the message of an unhandled exception', () => {
    const { body } = handle(new Error('postgres://user:password@host/db'));

    expect(JSON.stringify(body)).not.toContain('password');
  });

  describe('framework exceptions thrown without a declared code', () => {
    it.each([
      [new BadRequestException(), 400, AppErrorCode.VALIDATION_ERROR],
      [new UnauthorizedException(), 401, AppErrorCode.UNAUTHORIZED],
      [new ForbiddenException(), 403, AppErrorCode.FORBIDDEN],
      [new NotFoundException(), 404, AppErrorCode.NOT_FOUND],
      [new ThrottlerException(), 429, AppErrorCode.RATE_LIMITED],
    ])('maps %s to %i', (exception, statusCode, errorCode) => {
      expect(handle(exception)).toEqual({
        statusCode,
        body: { statusCode, errorCode },
      });
    });

    // An unmapped status means we threw something we never described. Calling it
    // a validation problem would blame the caller for our omission.
    it('falls back to INTERNAL_ERROR for an unmapped status', () => {
      expect(handle(new HttpException('teapot', 418))).toEqual({
        statusCode: 418,
        body: { statusCode: 418, errorCode: AppErrorCode.INTERNAL_ERROR },
      });
    });
  });

  it('ignores an errorCode that is not part of the shared contract', () => {
    const bogus = new HttpException(
      { errorCode: 'MADE_UP_CODE' },
      HttpStatus.BAD_REQUEST,
    );

    expect(handle(bogus).body).toEqual({
      statusCode: 400,
      errorCode: AppErrorCode.VALIDATION_ERROR,
    });
  });
});
