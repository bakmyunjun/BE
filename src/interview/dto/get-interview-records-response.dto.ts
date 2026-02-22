import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class InterviewRecordMetricsDto {
  @ApiProperty({ example: 75, description: '논리성 (0-100)' })
  logic: number;

  @ApiProperty({ example: 65, description: '구체성 (0-100)' })
  clarity: number;

  @ApiProperty({ example: 62, description: '시선 처리 (0-100)' })
  eyeContact: number;

  @ApiProperty({ example: 70, description: '목소리 (0-100)' })
  voice: number;

  @ApiProperty({ example: 76, description: 'STAR 기법 (0-100)' })
  star: number;

  @ApiProperty({ example: 84, description: '시간 관리 (0-100)' })
  time: number;
}

export class InterviewRecordDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 72, description: '총점 (0-100)' })
  score: number;

  @ApiProperty({ example: '2024-12-25', description: 'ISO 날짜(YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: '21분 05초', description: '면접 소요 시간' })
  duration: string;

  @ApiProperty({ example: '10/10 질문 완료' })
  questionProgress: string;

  @ApiProperty({
    type: [String],
    example: ['STAR 기법'],
    description: '강점 태그',
  })
  strengths: string[];

  @ApiProperty({
    type: [String],
    example: ['목소리 변조', '어휘 다양성'],
    description: '개선점 태그',
  })
  improvements: string[];

  @ApiProperty({ type: InterviewRecordMetricsDto })
  metrics: InterviewRecordMetricsDto;
}

export class GetInterviewRecordsResponseDto extends SuccessResponseDto<InterviewRecordDto[]> {
  @ApiProperty({ type: [InterviewRecordDto] })
  declare data: InterviewRecordDto[];
}
