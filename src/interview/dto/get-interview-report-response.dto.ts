import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class InterviewReportPayloadDto {
  @ApiProperty({ example: 'analyzing', enum: ['analyzing', 'done', 'failed'] })
  status: 'analyzing' | 'done' | 'failed';

  @ApiPropertyOptional({ example: 82.5 })
  totalScore?: number;

  @ApiPropertyOptional({ example: 615 })
  durationSec?: number;

  @ApiPropertyOptional({ example: 'solar-pro' })
  model?: string | null;

  @ApiPropertyOptional({ example: 'v1' })
  promptVersion?: string | null;

  @ApiPropertyOptional({ example: '2026-01-27T00:00:00.000Z' })
  generatedAt?: string | null;

  @ApiPropertyOptional({
    description:
      '리포트 결과(JSON). status=done면 평가 결과, status=failed면 error 포함 가능.',
    type: 'object',
    additionalProperties: true,
  })
  result?: unknown;
}

export class GetInterviewReportDataDto {
  @ApiProperty({ example: 'intv_123' })
  interviewId: string;

  @ApiProperty({
    example: 'ANALYZING',
    enum: ['IN_PROGRESS', 'ANALYZING', 'DONE', 'FAILED'],
  })
  interviewStatus: 'IN_PROGRESS' | 'ANALYZING' | 'DONE' | 'FAILED';

  @ApiPropertyOptional({ type: InterviewReportPayloadDto })
  report?: InterviewReportPayloadDto | null;
}

export class GetInterviewReportResponseDto extends SuccessResponseDto<GetInterviewReportDataDto> {}

