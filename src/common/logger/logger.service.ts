import {
  Injectable,
  LoggerService as NestLoggerService,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pino from 'pino';
import type { Env } from '../../config/env.schema';

/**
 * Pino 기반 Logger 서비스
 * 요청 단위 로깅 및 구조화된 로그 포맷 제공
 */
@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: pino.Logger;

  constructor(
    @Optional() private readonly configService?: ConfigService<Env, true>,
  ) {
    const nodeEnv =
      configService?.get('NODE_ENV', { infer: true }) ||
      process.env.NODE_ENV ||
      'development';

    this.logger = pino({
      level: nodeEnv === 'production' ? 'info' : 'debug',
      transport:
        nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'yyyy-mm-dd HH:MM:ss',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  /**
   * 일반 로그
   */
  log(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.info({ context, ...meta }, message);
  }

  /**
   * 에러 로그
   */
  error(
    message: string,
    trace?: string,
    context?: string,
    meta?: Record<string, unknown>,
  ) {
    this.logger.error(
      {
        context,
        trace,
        ...meta,
      },
      message,
    );
  }

  /**
   * 경고 로그
   */
  warn(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.warn({ context, ...meta }, message);
  }

  /**
   * 디버그 로그
   */
  debug(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.debug({ context, ...meta }, message);
  }

  /**
   * 요청 로그 (요청ID 포함)
   */
  logRequest(
    requestId: string,
    method: string,
    url: string,
    statusCode: number,
    responseTime: number,
    userId?: string,
    meta?: Record<string, unknown>,
  ) {
    this.logger.info(
      {
        requestId,
        method,
        url,
        statusCode,
        responseTime,
        userId,
        ...meta,
      },
      `${method} ${url} ${statusCode} - ${responseTime}ms`,
    );
  }

  /**
   * 에러 로그 (요청ID 포함)
   */
  logError(
    requestId: string,
    error: Error,
    context?: string,
    meta?: Record<string, unknown>,
  ) {
    this.logger.error(
      {
        requestId,
        context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        ...meta,
      },
      `Error: ${error.message}`,
    );
  }

  /**
   * HTTP 에러 로그
   */
  logHttpError(
    requestId: string,
    statusCode: number,
    errorCode: string,
    message: string,
    path: string,
    method: string,
    userId?: string,
    meta?: Record<string, unknown>,
  ) {
    this.logger.error(
      {
        requestId,
        statusCode,
        errorCode,
        message,
        path,
        method,
        userId,
        ...meta,
      },
      `HTTP ${statusCode} [${errorCode}] ${method} ${path}: ${message}`,
    );
  }

  /**
   * Pino Logger 인스턴스 직접 접근 (고급 사용)
   */
  getPinoLogger(): pino.Logger {
    return this.logger;
  }
}
