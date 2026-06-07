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
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = AppErrorCode.VALIDATION_ERROR;
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

  private defaultErrorCode(statusCode: HttpStatus): AppErrorCode {
    switch (statusCode) {
      case HttpStatus.UNAUTHORIZED:
        return AppErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return AppErrorCode.FORBIDDEN;
      case HttpStatus.UNPROCESSABLE_ENTITY:
      case HttpStatus.BAD_REQUEST:
        return AppErrorCode.VALIDATION_ERROR;
      default:
        return AppErrorCode.VALIDATION_ERROR;
    }
  }
}
