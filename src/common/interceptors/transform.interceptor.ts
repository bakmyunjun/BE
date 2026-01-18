import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { RequestWithId } from '../../types/express';
import { SuccessResponseDto } from '../dto/response.dto';

/**
 * TransformInterceptor
 * 모든 성공 응답을 공통 응답 포맷으로 변환합니다.
 *
 * 주의: requestId는 LoggingMiddleware에서 이미 설정되므로 여기서는 사용만 합니다.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, SuccessResponseDto<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponseDto<T>> {
    const request = context.switchToHttp().getRequest<RequestWithId>();

    // Request ID는 Middleware에서 이미 설정되었으므로 타입으로 보장됨
    // LoggingMiddleware가 먼저 실행되므로 항상 id가 존재함
    const requestId = request.id;

    return next.handle().pipe(
      map((data) => {
        // 이미 SuccessResponseDto 형식이면 그대로 반환
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          data.success === true
        ) {
          return data as SuccessResponseDto<T>;
        }

        // 일반 데이터는 SuccessResponseDto로 래핑
        return new SuccessResponseDto<T>(data, requestId);
      }),
    );
  }
}
