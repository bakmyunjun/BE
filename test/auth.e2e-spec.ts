import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";
import { GitHubStrategy } from "../src/auth/strategies/github.strategy";
import { KakaoStrategy } from "../src/auth/strategies/kakao.strategy";

describe("AuthController (e2e)", () => {
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
            startsWith: "test@",
          },
        },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe("GET /auth/me", () => {
    it("인증 없이 접근하면 401 에러", () => {
      return request(app.getHttpServer()).get("/auth/me").expect(401);
    });
  });
});
