import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<Env, true>);
  const port = configService.get('PORT', { infer: true });
  const nodeEnv = configService.get('NODE_ENV', { infer: true });

  // Helmet 보안 헤더 설정
  // Swagger UI를 위해 CSP 완화 (개발 환경)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Swagger UI를 위해 완화
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS 설정
  app.enableCors({
    origin:
      nodeEnv === 'production'
        ? process.env.FRONTEND_URL?.split(',') || []
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

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 새로고침해도 인증 정보 유지
    },
  });

  await app.listen(port);
}
bootstrap();
