import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

/**
 * 다음 질문 정보
 */
export class NextQuestionDto {
  @ApiProperty({ example: 'q_2', description: '질문 ID' })
  questionId: string;

  @ApiProperty({
    example: '그렇다면 useState와 useReducer의 차이점은 무엇인가요?',
    description: '질문 텍스트',
  })
  text: string;

  @ApiProperty({
    example: 'followup',
    enum: ['base', 'followup'],
    description: '질문 유형',
  })
  type: 'base' | 'followup';
}

/**
 * 턴 제출 응답 데이터
 */
export class SubmitTurnDataDto {
  @ApiProperty({ example: 'intv_123', description: '면접 ID' })
  interviewId: string;

  @ApiPropertyOptional({
    example: 2,
    description: '다음 턴 번호 (면접 완료 시 null)',
  })
  nextTurnIndex?: number | null;

  @ApiProperty({
    example: 'IN_PROGRESS',
    enum: ['IN_PROGRESS', 'ANALYZING', 'DONE', 'FAILED'],
    description: '면접 상태',
  })
  status: 'IN_PROGRESS' | 'ANALYZING' | 'DONE' | 'FAILED';

  @ApiPropertyOptional({
    type: NextQuestionDto,
    description: '다음 질문 (10턴 완료 시 null)',
  })
  nextQuestion?: NextQuestionDto | null;

  @ApiProperty({ example: true, description: '제출 성공 여부' })
  success: boolean;

  @ApiPropertyOptional({
    example: '답변이 제출되었습니다',
    description: '메시지',
  })
  message?: string;

  @ApiPropertyOptional({
    example: 1,
    description: '현재 연속 꼬리질문 횟수 (최대 2)',
  })
  consecutiveFollowupCount?: number;

  @ApiPropertyOptional({
    example: 1,
    description: '남은 꼬리질문 가능 횟수 (최대 2)',
  })
  remainingFollowupCount?: number;
}

/**
 * 턴 제출 응답 DTO
 */
export class SubmitTurnResponseDto extends SuccessResponseDto<SubmitTurnDataDto> {
  @ApiProperty({ type: SubmitTurnDataDto })
  declare data: SubmitTurnDataDto;
}
