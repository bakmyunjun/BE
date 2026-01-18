import 'express';

declare module 'express' {
  export interface Request {
    id?: string;
  }
}

/**
 * Request ID가 보장된 Request 타입
 * LoggingMiddleware 이후에는 항상 id가 설정되어 있음
 */
export type RequestWithId = import('express').Request & { id: string };
