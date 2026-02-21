import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SuccessResponseDto } from '../../common/dto/response.dto';

export class InterviewReportViewDto {
  @ApiProperty({
    description: '레포트 UI 렌더용 정규화 데이터',
    type: 'object',
    additionalProperties: true,
  })
  data: Record<string, unknown>;
}

export class InterviewReportPayloadDto {
  @ApiProperty({ example: 'analyzing', enum: ['analyzing', 'done', 'failed'] })
  status: 'analyzing' | 'done' | 'failed';

  @ApiPropertyOptional({ example: 82.5 })
  totalScore?: number;

  @ApiPropertyOptional({ example: 615 })
  durationSec?: number;

  @ApiPropertyOptional({ example: 'gpt-5-nano' })
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
    example: {
      version: 'v1',
      session: {
        sessionId: 'intv_123',
        title: '2026-02-21 (01)',
        topic: '{"mainTopicId":"backend","subTopicIds":["nestjs","db"]}',
      },
      totalScore: 82.5,
      summary:
        '전반적으로 논리적인 답변을 제시했으며, 일부 문항에서 수치 기반 근거를 보완하면 설득력이 높아진다.',
      strengths: ['답변 구조가 명확하다.', '핵심 키워드 전달이 안정적이다.'],
      weaknesses: ['성과 수치 제시가 부족하다.', '결론 문장이 길어지는 경향이 있다.'],
      competencies: {
        items: [
          {
            key: 'LOGIC',
            label: '논리성',
            level: '우수',
            score: 23,
            comment: '문제-해결-결과 구조가 대부분 유지되었다.',
          },
        ],
      },
      textPatternAnalysis: {
        issues: [
          {
            type: '근거 부족',
            severity: 'WARNING',
            description: '일부 답변에서 정량 근거가 생략되었다.',
            affectedTurnIndexes: [2, 4, 7],
          },
        ],
      },
      perTurnFeedback: [
        {
          turnIndex: 1,
          score: 78,
          feedback: '핵심 전달이 좋았으나 비교 지표를 추가하면 더 설득력 있다.',
          highlight: {
            strength: '답변 구조가 명확하다.',
            weakness: '정량 지표 부족',
            suggestion: '성과 수치를 1개 이상 포함해라.',
          },
        },
      ],
      _rawText: '{...}',
    },
  })
  result?: unknown;

  @ApiPropertyOptional({
    description: 'FE 탭 UI에 바로 매핑 가능한 정규화 데이터',
    type: 'object',
    additionalProperties: true,
    example: {
      header: {
        title: '2026-02-21 (01)',
        summary:
          '전반적으로 논리적인 답변을 제시했으며, 일부 문항에서 수치 기반 근거를 보완하면 설득력이 높아진다.',
        generatedAt: '2026-02-21T03:20:00.000Z',
      },
      summary: {
        totalScore: 82.5,
        strengths: ['답변 구조가 명확하다.', '핵심 키워드 전달이 안정적이다.'],
        weaknesses: ['성과 수치 제시가 부족하다.', '결론 문장이 길어지는 경향이 있다.'],
        competencies: [
          {
            key: 'LOGIC',
            label: '논리성',
            level: '우수',
            score: 23,
            comment: '문제-해결-결과 구조가 대부분 유지되었다.',
          },
        ],
      },
      analysis: {
        textPatternIssues: [
          {
            type: '근거 부족',
            severity: 'WARNING',
            description: '일부 답변에서 정량 근거가 생략되었다.',
            affectedTurnIndexes: [2, 4, 7],
          },
        ],
        perTurnScores: [
          { turnIndex: 1, score: 78 },
          { turnIndex: 2, score: 73 },
        ],
      },
      coaching: {
        actionItems: ['성과 수치를 포함해 답변해라.', '결론을 1문장으로 축약해라.'],
        turnSuggestions: [
          {
            turnIndex: 2,
            question: '협업 갈등을 해결한 경험을 설명해 주세요.',
            weakness: '수치 기반 성과가 없다.',
            suggestion: '개선율/기간 등 정량 수치를 포함해라.',
          },
        ],
      },
      record: {
        turns: [
          {
            turnIndex: 1,
            questionType: 'base',
            questionText: '자기소개를 해주세요.',
            answerText: '...',
            score: 78,
            feedback: '핵심 전달이 좋다.',
            highlight: {
              strength: '답변 구조가 명확하다.',
              weakness: '정량 지표 부족',
              suggestion: '성과 수치를 1개 이상 포함해라.',
            },
            submittedAt: '2026-02-21T03:05:20.000Z',
            metrics: {
              answerDuration: 41,
              isFollowupQuestion: false,
            },
          },
        ],
      },
    },
  })
  view?: Record<string, unknown>;
}

export class GetInterviewReportDataDto {
  @ApiProperty({ example: 'intv_123' })
  interviewId: string;

  @ApiProperty({ example: '프론트엔드 모의면접' })
  title: string | null;

  @ApiProperty({
    example: 'ANALYZING',
    enum: ['IN_PROGRESS', 'ANALYZING', 'DONE', 'FAILED'],
  })
  interviewStatus: 'IN_PROGRESS' | 'ANALYZING' | 'DONE' | 'FAILED';

  @ApiPropertyOptional({ type: InterviewReportPayloadDto })
  report?: InterviewReportPayloadDto | null;
}

export class GetInterviewReportResponseDto extends SuccessResponseDto<GetInterviewReportDataDto> {
  @ApiProperty({ type: GetInterviewReportDataDto })
  declare data: GetInterviewReportDataDto;
}
