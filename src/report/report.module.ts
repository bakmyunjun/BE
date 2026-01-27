import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ReportService } from './report.service';

@Module({
  imports: [AiModule],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}

