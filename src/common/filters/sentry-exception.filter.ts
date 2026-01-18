import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { RequestWithId } from '../../types/express';

/**
 * Sentry에 에러를 전송하는 글로벌 필터
 * 500번대 에러만 Sentry로 전송 (4xx는 클라이언트 오류이므로 제외)
 */
@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestWithId>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 500번대 에러만 Sentry에 전송 (4xx는 클라이언트 오류이므로 제외)
    if (status >= 500) {
      Sentry.captureException(exception, {
        extra: {
          url: request.url,
          method: request.method,
          headers: request.headers,
          query: request.query,
          body: request.body,
        },
        tags: {
          url: request.url,
          method: request.method,
        },
        user: request.user
          ? {
              // 인증된 사용자 정보가 있으면 추가
              id: (request.user as { id?: bigint }).id?.toString(),
            }
          : undefined,
      });
    }

    // 예외를 다시 던져서 기본 예외 필터가 처리하도록 함
    throw exception;
  }
}
