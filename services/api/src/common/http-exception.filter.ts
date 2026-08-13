import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorBody = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = isHttpException ? exception.getResponse() : undefined;
    const body: ErrorBody = typeof raw === 'object' && raw !== null ? raw : {};
    const rawMessage =
      typeof raw === 'string'
        ? raw
        : (body.message ?? 'An unexpected error occurred');
    const message = Array.isArray(rawMessage)
      ? rawMessage.join('; ')
      : rawMessage;

    if (!isHttpException) {
      const error =
        exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `${request.method} ${request.originalUrl} [${request.requestId ?? 'no-request-id'}]`,
        error.stack,
      );
    }

    response.status(status).json({
      code:
        body.code ??
        body.error?.toUpperCase().replace(/\s+/g, '_') ??
        `HTTP_${status}`,
      message:
        status === HttpStatus.INTERNAL_SERVER_ERROR
          ? 'An unexpected error occurred'
          : message,
      requestId: request.requestId ?? null,
    });
  }
}
