import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorResponseDto } from '../dto/response.dto';
import { generateRequestId } from '../utils/request-id.util';
import { LoggerService } from '../logger/logger.service';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();

    // Request ID 가져오기 (이미 설정되어 있다면 사용, 없으면 새로 생성)
    const requestId =
      (request.headers['x-request-id'] as string) ||
      request.id ||
      generateRequestId();

    const exceptionResponse = exception.getResponse();

    // ValidationPipe 에러 포맷 처리
    let errorCode: string;
    let errorMessage: string;
    let errorDetails: unknown;

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const responseObj = exceptionResponse as {
        message?: string | string[];
        error?: string;
        statusCode?: number;
      };

      // ValidationPipe 에러는 배열로 오는 경우가 많음
      if (Array.isArray(responseObj.message)) {
        errorCode = 'VALIDATION_ERROR';
        errorMessage = '입력값 검증에 실패했습니다.';
        errorDetails = {
          fields: responseObj.message,
        };
      } else {
        errorCode =
          responseObj.statusCode?.toString() ||
          HttpStatus[status] ||
          'UNKNOWN_ERROR';
        errorMessage =
          (responseObj.message as string) ||
          exception.message ||
          '오류가 발생했습니다.';
        errorDetails = responseObj;
      }
    } else {
      errorCode = HttpStatus[status] || 'UNKNOWN_ERROR';
      errorMessage = exception.message || '오류가 발생했습니다.';
    }

    const errorResponse = new ErrorResponseDto(
      errorCode,
      errorMessage,
      requestId as string,
      errorDetails,
    );

    // 에러 로깅
    this.logger.logHttpError(
      requestId as string,
      status,
      errorCode,
      errorMessage,
      request.path,
      request.method,
      (request as { user?: { id?: string } }).user?.id,
      {
        errorDetails,
        body: request.body,
        query: request.query,
      },
    );

    response.status(status).json(errorResponse);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      request.id ||
      generateRequestId();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorMessage =
      exception instanceof Error
        ? exception.message
        : '예상치 못한 오류가 발생했습니다.';

    const errorResponse = new ErrorResponseDto(
      'INTERNAL_SERVER_ERROR',
      errorMessage,
      requestId as string,
      process.env.NODE_ENV === 'development'
        ? { stack: exception instanceof Error ? exception.stack : undefined }
        : undefined,
    );

    // 에러 로깅
    if (exception instanceof Error) {
      this.logger.logError(
        requestId as string,
        exception,
        'AllExceptionsFilter',
        {
          path: request.path,
          method: request.method,
          userId: (request as { user?: { id?: string } }).user?.id,
          body: request.body,
          query: request.query,
        },
      );
    } else {
      this.logger.logHttpError(
        requestId as string,
        status,
        'INTERNAL_SERVER_ERROR',
        errorMessage,
        request.path,
        request.method,
        (request as { user?: { id?: string } }).user?.id,
        {
          error: String(exception),
        },
      );
    }

    response.status(status).json(errorResponse);
  }
}
