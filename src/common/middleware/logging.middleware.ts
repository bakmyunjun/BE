import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import pinoHttp from "pino-http";
import { LoggerService } from "../logger/logger.service";

/**
 * 요청 로깅 미들웨어
 * 모든 HTTP 요청을 로깅하고 요청ID를 생성/확정합니다.
 *
 * - Request ID를 가장 앞단에서 한번만 확정
 * - pino-http가 response finish 이벤트로 응답 로깅 처리
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly pinoHttpMiddleware: ReturnType<typeof pinoHttp>;

  constructor(private readonly logger: LoggerService) {
    this.pinoHttpMiddleware = pinoHttp({
      logger: logger.getPinoLogger(),
      genReqId: (req: Request) => {
        // Request ID 확정: 헤더에 있으면 사용, 없으면 생성
        // 이 값이 request.id로 설정되어 이후 모든 레이어에서 사용됨
        const requestId =
          (req.headers["x-request-id"] as string) ||
          `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // request 객체에 저장 (Interceptor, Filter 등에서 사용)
        (req as { id?: string }).id = requestId;

        return requestId;
      },
      customSuccessMessage: (req: Request, res: Response) => {
        return `${req.method} ${req.url} ${res.statusCode}`;
      },
      customErrorMessage: (req: Request, res: Response, error: Error) => {
        return `${req.method} ${req.url} ${res.statusCode} - ${error.message}`;
      },
      customAttributeKeys: {
        req: "request",
        res: "response",
        err: "error",
        responseTime: "responseTime",
      },
      customProps: (req: Request) => {
        // request.id는 이미 genReqId에서 설정되었으므로 사용만 함
        return {
          requestId: (req as { id?: string }).id,
          userId: (req as { user?: { id?: string } }).user?.id,
        };
      },
      serializers: {
        req: (req: Request) => ({
          id: (req as { id?: string }).id,
          method: req.method,
          url: req.url,
          path: req.path,
          query: req.query,
          headers: {
            host: req.headers.host,
            "user-agent": req.headers["user-agent"],
            "content-type": req.headers["content-type"],
          },
        }),
        res: (res: Response) => ({
          statusCode: res.statusCode,
        }),
      },
    });
  }

  use(req: Request, res: Response, next: NextFunction) {
    this.pinoHttpMiddleware(req, res, next);
  }
}
