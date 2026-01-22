import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class TopicItemDto {
  @ApiProperty({ example: 'frontend' })
  id: string;

  @ApiProperty({ example: '프론트엔드' })
  label: string;
}

export class TopicsDto {
  @ApiProperty({ type: TopicItemDto })
  main: TopicItemDto;

  @ApiProperty({ type: [TopicItemDto] })
  subs: TopicItemDto[];
}

export class FirstQuestionDto {
  @ApiProperty({ example: 'q_1' })
  questionId: string;

  @ApiProperty({
    example:
      'React에서 상태 업데이트가 비동기적으로 보일 수 있는 이유를 설명해보세요.',
  })
  text: string;
}

export class CreateInterviewDataDto {
  @ApiProperty({ example: 'intv_123' })
  interviewId: string;

  @ApiProperty({ example: '프론트엔드 모의면접' })
  title: string;

  @ApiProperty({ type: TopicsDto })
  topics: TopicsDto;

  @ApiProperty({ example: 'IN_PROGRESS' })
  status: 'IN_PROGRESS' | 'DONE' | 'FAILED';

  @ApiProperty({ example: 1 })
  turnIndex: number;

  @ApiProperty({ type: FirstQuestionDto })
  firstQuestion: FirstQuestionDto;
}

export class CreateInterviewResponseDto extends SuccessResponseDto<CreateInterviewDataDto> {}
