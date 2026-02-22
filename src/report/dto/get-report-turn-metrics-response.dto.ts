import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class TurnMetricDataDto {
  @ApiProperty({ example: 'Q1', description: '질문 식별자 (Q1~Q10)' })
  question: string;

  @ApiProperty({ example: 18, description: '답변 시간(초)' })
  time: number;

  @ApiProperty({ example: 12, description: '시선 이탈 비율(%)' })
  eyeOff: number;

  @ApiProperty({ example: 8, description: '침묵 비율(%)' })
  silence: number;
}

export class GetReportTurnMetricsResponseDto extends SuccessResponseDto<
  TurnMetricDataDto[]
> {
  @ApiProperty({ type: [TurnMetricDataDto] })
  declare data: TurnMetricDataDto[];
}
