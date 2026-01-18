import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Request ID 데코레이터
 * 요청에서 requestId를 가져옵니다.
 */
export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['x-request-id'] || request.id || 'unknown';
  },
);
