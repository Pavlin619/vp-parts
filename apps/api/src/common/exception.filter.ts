import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppErrorCode, ApiErrorResponse } from '@vp-parts-shop/shared';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number;
    let errorCode: AppErrorCode;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      errorCode =
        this.extractErrorCode(body) ?? this.defaultErrorCode(statusCode);
      this.logger.warn(
        `${request.method} ${request.url} → ${statusCode} ${errorCode}`,
      );
    } else {
      // Nothing threw this deliberately, so we know nothing about it: it is a
      // 500, and the client is told only that. The stack stays in the logs.
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = AppErrorCode.INTERNAL_ERROR;
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorResponse = { statusCode, errorCode };
    response.status(statusCode).json(body);
  }

  private extractErrorCode(body: string | object): AppErrorCode | undefined {
    if (typeof body === 'object' && body !== null && 'errorCode' in body) {
      const code = (body as Record<string, unknown>).errorCode;
      if (
        typeof code === 'string' &&
        Object.values(AppErrorCode).includes(code as AppErrorCode)
      ) {
        return code as AppErrorCode;
      }
    }
    return undefined;
  }

  /**
   * Fallback for an {@link HttpException} thrown without a declared error code —
   * either by the framework itself (an unmatched route, the validation pipe, the
   * throttler) or by our own code, which should declare one.
   *
   * The `default` arm is INTERNAL_ERROR rather than a guess: reaching it means a
   * status we never mapped, and describing that to the client as a validation
   * problem sends the caller looking for a fault in their own request.
   */
  private defaultErrorCode(statusCode: HttpStatus): AppErrorCode {
    switch (statusCode) {
      case HttpStatus.UNAUTHORIZED:
        return AppErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return AppErrorCode.FORBIDDEN;
      case HttpStatus.UNPROCESSABLE_ENTITY:
      case HttpStatus.BAD_REQUEST:
        return AppErrorCode.VALIDATION_ERROR;
      case HttpStatus.NOT_FOUND:
        return AppErrorCode.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return AppErrorCode.RATE_LIMITED;
      default:
        return AppErrorCode.INTERNAL_ERROR;
    }
  }
}
