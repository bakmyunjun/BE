import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';

/**
 * Logger 모듈
 * 전역에서 사용할 수 있는 로거 제공
 */
@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
