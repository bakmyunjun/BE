import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types";
import { AppModule } from "./../src/app.module";
import { TransformInterceptor } from "../src/common/interceptors/transform.interceptor";

describe("AppController (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // LoggingMiddleware는 AppModule에서 자동으로 적용됨
    // main.ts와 동일한 글로벌 설정 적용
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      })
    );
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("/ (GET)", () => {
    return request(app.getHttpServer())
      .get("/")
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty("success", true);
        expect(res.body).toHaveProperty("data", "Hello World!");
        expect(res.body).toHaveProperty("meta");
        expect(res.body.meta).toHaveProperty("requestId");
        expect(res.body.meta).toHaveProperty("timestamp");
      });
  });
});
