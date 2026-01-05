import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/database/prisma.service";

async function checkDatabaseConnection() {
  try {
    const app = await NestFactory.createApplicationContext(AppModule);
    const prismaService = app.get(PrismaService);

    // 데이터베이스 연결 테스트
    await prismaService.$queryRaw`SELECT 1`;
    console.log("✅ 데이터베이스 연결 성공!");

    // 데이터베이스 정보 출력
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      const url = new URL(databaseUrl);
      console.log("📊 연결 정보:");
      console.log(`   - Host: ${url.hostname}`);
      console.log(`   - Port: ${url.port || "5432"}`);
      console.log(`   - Database: ${url.pathname.slice(1)}`);
    }

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ 데이터베이스 연결 실패:", error);
    process.exit(1);
  }
}

checkDatabaseConnection();

