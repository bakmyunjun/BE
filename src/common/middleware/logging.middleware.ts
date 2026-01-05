import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import pinoHttp from "pino-http";
import { LoggerService } from "../logger/logger.service";

/**
 * 요청 로깅 미들웨어
 * 모든 HTTP 요청을 로깅하고 요청ID를 포함합니다.
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly pinoHttpMiddleware: ReturnType<typeof pinoHttp>;

  constructor(private readonly logger: LoggerService) {
    this.pinoHttpMiddleware = pinoHttp({
      logger: logger.getPinoLogger(),
      genReqId: (req: Request) => {
        // 요청 ID가 이미 있으면 사용, 없으면 생성
        return (
          (req.headers["x-request-id"] as string) ||
          (req as { id?: string }).id ||
          `req_${Date.now()}_${Math.random().toString(36).substring(7)}`
        );
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
        // 요청 ID를 request 객체에 저장
        const requestId =
          (req.headers["x-request-id"] as string) ||
          (req as { id?: string }).id ||
          `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        (req as { id?: string }).id = requestId;

        return {
          requestId,
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

