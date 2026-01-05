import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { Request } from "express";
import { SuccessResponseDto } from "../dto/response.dto";
import { generateRequestId } from "../utils/request-id.util";

/**
 * TransformInterceptor
 * 모든 성공 응답을 공통 응답 포맷으로 변환합니다.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, SuccessResponseDto<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Observable<SuccessResponseDto<T>> {
    const request = context.switchToHttp().getRequest<Request>();

    // Request ID 설정 (없으면 생성)
    const requestId =
      (request.headers["x-request-id"] as string) ||
      request.id ||
      generateRequestId();
    // Request 객체에 id 속성 설정
    request.id = requestId;

    return next.handle().pipe(
      map((data) => {
        // 이미 SuccessResponseDto 형식이면 그대로 반환
        if (
          data &&
          typeof data === "object" &&
          "success" in data &&
          data.success === true
        ) {
          return data as SuccessResponseDto<T>;
        }

        // 일반 데이터는 SuccessResponseDto로 래핑
        return new SuccessResponseDto<T>(data, requestId as string);
      })
    );
  }
}
