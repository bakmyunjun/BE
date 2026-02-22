import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class ReportSummarySkillsDto {
  @ApiProperty({ example: 78, description: '논리성 (0-100)' })
  logic: number;

  @ApiProperty({ example: 72, description: '구체성 (0-100)' })
  specificity: number;

  @ApiProperty({ example: 85, description: '전달력 (0-100)' })
  delivery: number;

  @ApiProperty({ example: 68, description: '시선 처리 (0-100)' })
  eyeContact: number;

  @ApiProperty({ example: 74, description: '목소리 (0-100)' })
  voice: number;

  @ApiProperty({ example: 80, description: 'STAR 구조 (0-100)' })
  structure: number;
}

export class ReportSummaryDto {
  @ApiProperty({ type: ReportSummarySkillsDto })
  skills: ReportSummarySkillsDto;

  @ApiProperty({
    type: [String],
    description: '강점 TOP3',
    example: [
      '답변의 논리적 구조가 명확하고 일관성이 있습니다',
      'STAR 기법을 활용한 구조화된 답변이 돋보입니다',
      '핵심 메시지 전달력이 우수합니다',
    ],
  })
  strengths: string[];

  @ApiProperty({
    type: [String],
    description: '개선점 TOP3',
    example: [
      '구체적인 수치나 성과 데이터를 더 활용해보세요',
      '카메라 응시를 더 자연스럽게 유지해보세요',
      '답변 중 적절한 pause를 활용하면 더 좋습니다',
    ],
  })
  improvements: string[];
}

export class GetReportSummaryResponseDto extends SuccessResponseDto<ReportSummaryDto> {
  @ApiProperty({ type: ReportSummaryDto })
  declare data: ReportSummaryDto;
}
