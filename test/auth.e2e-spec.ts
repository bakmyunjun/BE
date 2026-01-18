import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { GitHubStrategy } from '../src/auth/strategies/github.strategy';
import { KakaoStrategy } from '../src/auth/strategies/kakao.strategy';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GitHubStrategy)
      .useFactory({
        factory: () => ({
          validate: jest.fn(),
        }),
      })
      .overrideProvider(KakaoStrategy)
      .useFactory({
        factory: () => ({
          validate: jest.fn(),
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterEach(async () => {
    if (prismaService) {
      // 테스트 데이터 정리
      await prismaService.user.deleteMany({
        where: {
          email: {
            startsWith: 'test@',
          },
        },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe('GET /auth/me', () => {
    it('인증 없이 접근하면 401 에러', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });
  });

  describe('GET /auth/github', () => {
    it('redirect_uri 없이 OAuth 시작 가능', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/github')
        .expect(302); // 실제 302 리다이렉트

      // Location 헤더에 리다이렉트 URL이 포함되어 있음
      const redirectUrl = response.headers.location;
      expect(redirectUrl).toContain('github.com/login/oauth/authorize');
      expect(redirectUrl).toContain('client_id=');
      expect(redirectUrl).toContain('state=');
      // GitHub OAuth는 PKCE를 지원하지 않으므로 code_challenge 제거
    });

    it('허용된 redirect_uri로 OAuth 시작 가능', async () => {
      const redirectUri = 'http://localhost:3000/auth/callback';
      const response = await request(app.getHttpServer())
        .get(`/auth/github?redirect_uri=${encodeURIComponent(redirectUri)}`)
        .expect(302);

      const redirectUrl = response.headers.location;
      expect(redirectUrl).toContain('github.com/login/oauth/authorize');

      // State에서 redirectUri가 저장되었는지 확인
      const stateMatch = redirectUrl.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      if (!stateMatch) return; // TypeScript null check

      const state = stateMatch[1];
      const stateRecord = await prismaService.oAuthState.findUnique({
        where: { state },
      });
      expect(stateRecord).toBeTruthy();
      // biome-ignore lint/suspicious/noExplicitAny: Prisma 타입이 redirectUri를 인식하지 못함
      expect((stateRecord as any)?.redirectUri).toBe(redirectUri);
    });

    it('허용되지 않은 redirect_uri는 500 에러 (BadRequestException이 InternalServerErrorException으로 래핑됨)', async () => {
      const redirectUri = 'https://malicious.com/auth/callback';
      await request(app.getHttpServer())
        .get(`/auth/github?redirect_uri=${encodeURIComponent(redirectUri)}`)
        .expect(500);

      // 에러가 발생했는지만 확인 (로그에 에러 메시지가 출력됨)
    });

    it('잘못된 형식의 redirect_uri는 500 에러 (BadRequestException이 InternalServerErrorException으로 래핑됨)', async () => {
      const redirectUri = 'not-a-valid-url';
      await request(app.getHttpServer())
        .get(`/auth/github?redirect_uri=${encodeURIComponent(redirectUri)}`)
        .expect(500);

      // 에러가 발생했는지만 확인 (로그에 에러 메시지가 출력됨)
    });
  });

  describe('OAuth State 관리 (통합 테스트)', () => {
    it('State에 redirectUri가 저장되고 조회됨', async () => {
      const redirectUri = 'http://localhost:3000/auth/callback';

      // OAuth 시작 요청
      const response = await request(app.getHttpServer())
        .get(`/auth/github?redirect_uri=${encodeURIComponent(redirectUri)}`)
        .expect(302);

      // State 추출
      const redirectUrl = response.headers.location;
      const stateMatch = redirectUrl.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      if (!stateMatch) return; // TypeScript null check
      const state = stateMatch[1];

      // DB에서 State 조회
      const stateRecord = await prismaService.oAuthState.findUnique({
        where: { state },
      });
      expect(stateRecord).toBeTruthy();
      // biome-ignore lint/suspicious/noExplicitAny: Prisma 타입이 redirectUri를 인식하지 못함
      expect((stateRecord as any)?.redirectUri).toBe(redirectUri);
    });

    it('redirectUri 없이 State 생성 가능', async () => {
      // OAuth 시작 요청 (redirectUri 없음)
      const response = await request(app.getHttpServer())
        .get('/auth/github')
        .expect(302);

      // State 추출
      const redirectUrl = response.headers.location;
      const stateMatch = redirectUrl.match(/state=([^&]+)/);
      expect(stateMatch).toBeTruthy();
      if (!stateMatch) return; // TypeScript null check
      const state = stateMatch[1];

      // DB에서 State 조회
      const stateRecord = await prismaService.oAuthState.findUnique({
        where: { state },
      });
      expect(stateRecord).toBeTruthy();
      // biome-ignore lint/suspicious/noExplicitAny: Prisma 타입이 redirectUri를 인식하지 못함
      expect((stateRecord as any)?.redirectUri).toBeNull();
    });
  });
});
