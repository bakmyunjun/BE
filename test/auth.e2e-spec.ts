import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

describe("AuthController (e2e)", () => {
  let app: INestApplication<App>;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prismaService = moduleFixture.get<PrismaService>(PrismaService);

    await app.init();
  });

  afterEach(async () => {
    // 테스트 데이터 정리
    await prismaService.user.deleteMany({
      where: {
        email: {
          startsWith: "test@",
        },
      },
    });
    await app.close();
  });

  describe("GET /auth/me", () => {
    it("인증 없이 접근하면 401 에러", () => {
      return request(app.getHttpServer()).get("/auth/me").expect(401);
    });
  });
});
