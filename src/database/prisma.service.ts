import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService
 * Prisma Client를 NestJS 서비스로 래핑하여 전역에서 사용할 수 있도록 함
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * 모듈 초기화 시 Prisma Client 연결
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * 모듈 종료 시 Prisma Client 연결 종료
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
