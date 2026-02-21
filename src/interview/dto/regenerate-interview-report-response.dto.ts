import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class RegenerateInterviewReportDataDto {
  @ApiProperty({ example: 'intv_123' })
  interviewId: string;

  @ApiProperty({ example: 'ANALYZING', enum: ['ANALYZING'] })
  status: 'ANALYZING';

  @ApiProperty({ example: 'AI 리포트 재생성을 시작했습니다.' })
  message: string;
}

export class RegenerateInterviewReportResponseDto extends SuccessResponseDto<RegenerateInterviewReportDataDto> {
  @ApiProperty({ type: RegenerateInterviewReportDataDto })
  declare data: RegenerateInterviewReportDataDto;
}
