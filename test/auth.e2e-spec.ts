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

  describe("POST /auth/register", () => {
    it("회원가입 성공", () => {
      return request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: "test@example.com",
          password: "password123",
          username: "testuser",
          name: "Test User",
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("success", true);
          expect(res.body.data).toHaveProperty("accessToken");
          expect(res.body.data).toHaveProperty("refreshToken");
          expect(res.body.data).toHaveProperty("user");
        });
    });

    it("이메일 형식이 잘못되면 400 에러", () => {
      return request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: "invalid-email",
          password: "password123",
        })
        .expect(400);
    });

    it("비밀번호가 너무 짧으면 400 에러", () => {
      return request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: "test@example.com",
          password: "short",
        })
        .expect(400);
    });
  });

  describe("GET /auth/me", () => {
    it("인증 없이 접근하면 401 에러", () => {
      return request(app.getHttpServer()).get("/auth/me").expect(401);
    });

    it("유효한 토큰으로 접근하면 사용자 정보 반환", async () => {
      // 먼저 회원가입
      const registerResponse = await request(app.getHttpServer())
        .post("/auth/register")
        .send({
          email: "test@example.com",
          password: "password123",
        })
        .expect(201);

      const accessToken = registerResponse.body.data.accessToken;

      // 토큰으로 사용자 정보 조회
      return request(app.getHttpServer())
        .get("/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("success", true);
          expect(res.body.data).toHaveProperty("id");
          expect(res.body.data).toHaveProperty("email", "test@example.com");
        });
    });
  });
});
