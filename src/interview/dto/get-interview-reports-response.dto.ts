import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class InterviewReportListItemDto {
  @ApiProperty({ example: 'intv_123' })
  interviewId: string;

  @ApiProperty({ example: '프론트엔드 모의면접' })
  title: string | null;

  @ApiProperty({
    example: 'DONE',
    enum: ['IN_PROGRESS', 'ANALYZING', 'DONE', 'FAILED'],
  })
  interviewStatus: 'IN_PROGRESS' | 'ANALYZING' | 'DONE' | 'FAILED';

  @ApiPropertyOptional({ example: 'done', enum: ['analyzing', 'done', 'failed'] })
  reportStatus?: 'analyzing' | 'done' | 'failed' | null;

  @ApiPropertyOptional({ example: 82.5 })
  totalScore?: number | null;

  @ApiPropertyOptional({ example: '2026-01-27T00:00:00.000Z' })
  generatedAt?: string | null;

  @ApiProperty({ example: '2026-01-20T12:00:00.000Z' })
  createdAt: string;
}

export class InterviewReportListPageDto {
  @ApiProperty({ example: 1 })
  number: number;

  @ApiProperty({ example: 10 })
  size: number;

  @ApiProperty({ example: 25 })
  totalItems: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasNext: boolean;

  @ApiProperty({ example: false })
  hasPrev: boolean;
}

export class GetInterviewReportsDataDto {
  @ApiProperty({ type: [InterviewReportListItemDto] })
  items: InterviewReportListItemDto[];

  @ApiProperty({ type: InterviewReportListPageDto })
  page: InterviewReportListPageDto;
}

export class GetInterviewReportsResponseDto extends SuccessResponseDto<GetInterviewReportsDataDto> {
  @ApiProperty({ type: GetInterviewReportsDataDto })
  data: GetInterviewReportsDataDto;
}
