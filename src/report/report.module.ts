import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';

@Module({
  imports: [AiModule],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
