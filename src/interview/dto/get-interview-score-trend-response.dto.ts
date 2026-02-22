import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class ScoreTrendDataDto {
  @ApiProperty({ example: '12/18', description: 'MM/DD 형식 날짜' })
  date: string;

  @ApiProperty({ example: 72, description: '점수 (0-100)' })
  score: number;
}

export class GetInterviewScoreTrendResponseDto extends SuccessResponseDto<
  ScoreTrendDataDto[]
> {
  @ApiProperty({ type: [ScoreTrendDataDto] })
  declare data: ScoreTrendDataDto[];
}
