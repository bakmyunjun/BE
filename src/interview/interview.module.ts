import { Module } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { InterviewController } from './interview.controller';
import { InterviewRecordController } from './interview-record.controller';
import { AiModule } from '../ai/ai.module';
import { ReportModule } from '../report/report.module';

@Module({
  imports: [AiModule, ReportModule],
  controllers: [InterviewController, InterviewRecordController],
  providers: [InterviewService],
})
export class InterviewModule {}
