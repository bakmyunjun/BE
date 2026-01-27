import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';

async function bootstrap() {
  // Sentry 초기화 (앱 생성 전)
  const sentryDsn = process.env.SENTRY_DSN;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV || 'development',
      // 개발: 100%, 프로덕션: 10% (비용 절감)
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      integrations: [
        // nodeProfilingIntegration(), // Temporarily disabled due to native module issues
        Sentry.prismaIntegration(),
      ],
    });
  }

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<Env, true>);
  const port = configService.get('PORT', { infer: true });
  const nodeEnv = configService.get('NODE_ENV', { infer: true });
  const enableSwagger =
    configService.get('ENABLE_SWAGGER', { infer: true }) ??
    nodeEnv !== 'production';
  const frontendUrls = configService.get('FRONTEND_URL', { infer: true });
  const swaggerBasicUser = configService.get('SWAGGER_BASIC_USER', {
    infer: true,
  });
  const swaggerBasicPassword = configService.get('SWAGGER_BASIC_PASSWORD', {
    infer: true,
  });

  // Helmet 보안 헤더 설정
  // Swagger UI를 위해 CSP 완화 (Swagger가 켜진 경우만)
  app.use(
    helmet({
      contentSecurityPolicy: enableSwagger
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Swagger UI를 위해 완화
              imgSrc: ["'self'", 'data:', 'https:'],
            },
          }
        : undefined,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS 설정
  app.enableCors({
    origin:
      nodeEnv === 'production'
        ? frontendUrls
        : [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:5173',
          ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // 글로벌 ValidationPipe 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 정의되지 않은 속성 제거
      forbidNonWhitelisted: true, // DTO에 정의되지 않은 속성이 있으면 에러
      transform: true, // 요청 데이터를 DTO 인스턴스로 변환
      transformOptions: {
        enableImplicitConversion: true, // 타입 자동 변환 (string -> number 등)
      },
    }),
  );

  // 글로벌 예외 필터는 AppModule에서 APP_FILTER로 등록됨

  // 글로벌 인터셉터 (응답 변환)
  app.useGlobalInterceptors(new TransformInterceptor());

  // Sentry 에러 필터 (500번대 에러만 Sentry에 전송)
  if (sentryDsn) {
    app.useGlobalFilters(new SentryExceptionFilter());
  }

  // Swagger API 문서 설정 (항상 활성화)
  const config = new DocumentBuilder()
    .setTitle('Bakmyunjun API')
    .setDescription('Bakmyunjun 백엔드 API 문서')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'JWT 토큰을 입력하세요',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', '인증 관련 API')
    .addTag('users', '사용자 관련 API')
    .build();

  if (enableSwagger) {
    // production에서는 Swagger를 Basic Auth로 보호
    if (nodeEnv === 'production') {
      const requireBasicAuth = (
        req: Request,
        res: Response,
        next: NextFunction,
      ) => {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Basic ')) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
          return res.status(401).send('Unauthorized');
        }

        const encoded = authHeader.slice('Basic '.length);
        let decoded: string;
        try {
          decoded = Buffer.from(encoded, 'base64').toString('utf8');
        } catch {
          res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
          return res.status(401).send('Unauthorized');
        }

        const sep = decoded.indexOf(':');
        const user = sep >= 0 ? decoded.slice(0, sep) : '';
        const pass = sep >= 0 ? decoded.slice(sep + 1) : '';

        if (user !== swaggerBasicUser || pass !== swaggerBasicPassword) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Swagger"');
          return res.status(401).send('Unauthorized');
        }

        next();
      };

      app.use(['/api', '/api-json'], requireBasicAuth);
    }

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document, {
      swaggerOptions: {
        persistAuthorization: true, // 새로고침해도 인증 정보 유지
      },
    });
  }

  await app.listen(port);
}
bootstrap();
