import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Param,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { InterviewService } from './interview.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { SuccessResponseDto } from '../common/dto/response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  CreateInterviewDataDto,
  CreateInterviewResponseDto,
} from './dto/create-interview-response.dto';
import { SubmitTurnDto } from './dto/submit-turn.dto';
import {
  SubmitTurnDataDto,
  SubmitTurnResponseDto,
} from './dto/submit-turn-response.dto';
import {
  GetInterviewReportDataDto,
  GetInterviewReportResponseDto,
} from './dto/get-interview-report-response.dto';
import {
  GetInterviewReportsDataDto,
  GetInterviewReportsResponseDto,
} from './dto/get-interview-reports-response.dto';
import {
  RegenerateInterviewReportDataDto,
  RegenerateInterviewReportResponseDto,
} from './dto/regenerate-interview-report-response.dto';
import { User, type UserPayload } from '../auth/decorators/user.decorator';
import { DevPublic } from '../auth/decorators/public.decorator';

@ApiTags('interviews')
@Controller('interviews')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post()
  @DevPublic() // 개발 환경에서 인증 없이 테스트 가능
  @ApiOperation({
    summary: '면접 생성 및 시작(첫 질문 반환)',
    description: '개발 환경에서는 인증 없이 사용 가능합니다.',
  })
  @ApiBody({ type: CreateInterviewDto })
  @ApiOkResponse({ type: CreateInterviewResponseDto })
  async create(
    @Body() dto: CreateInterviewDto,
    @Req() req: Request,
    @User() user?: UserPayload,
  ) {
    const requestId =
      req.id || (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

    // user가 없으면 테스트용 ID 사용 (개발 환경)
    let userId: string;
    if (user?.id) userId = String(user.id);
    else if (process.env.NODE_ENV === 'production')
      throw new UnauthorizedException();
    else userId = '999999';

    const data: CreateInterviewDataDto =
      await this.interviewService.createAndStart(dto, userId);

    return new SuccessResponseDto(data, requestId);
  }

  @Post(':interviewId/turns')
  @DevPublic() // 개발 환경에서 인증 없이 테스트 가능
  @ApiOperation({
    summary: '턴 제출 및 다음 질문 생성',
    description: '개발 환경에서는 인증 없이 사용 가능합니다.',
  })
  @ApiParam({
    name: 'interviewId',
    example: 'intv_123',
    description: '면접 ID',
  })
  @ApiBody({ type: SubmitTurnDto })
  @ApiOkResponse({ type: SubmitTurnResponseDto })
  async submitTurn(
    @Param('interviewId') interviewId: string,
    @Body() dto: SubmitTurnDto,
    @Req() req: Request,
    @User() user?: UserPayload,
  ) {
    const requestId =
      req.id || (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

    // user가 없으면 테스트용 ID 사용 (개발 환경)
    let userId: string;
    if (user?.id) userId = String(user.id);
    else if (process.env.NODE_ENV === 'production')
      throw new UnauthorizedException();
    else userId = '999999';

    const data: SubmitTurnDataDto = await this.interviewService.submitTurn(
      interviewId,
      dto,
      userId,
    );

    return new SuccessResponseDto(data, requestId);
  }

  @Get('reports')
  @DevPublic() // 개발 환경에서 인증 없이 테스트 가능
  @ApiOperation({
    summary: '면접 리포트 전체 조회',
    description:
      '사용자의 면접 리포트 목록을 페이지네이션으로 조회합니다. 개발 환경에서는 인증 없이 사용 가능합니다.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: '페이지 번호 (기본값: 1)',
  })
  @ApiQuery({
    name: 'size',
    required: false,
    type: Number,
    example: 10,
    description: '페이지 크기 (기본값: 10, 최대 100)',
  })
  @ApiOkResponse({ type: GetInterviewReportsResponseDto })
  async getReports(
    @Query() query: PaginationQueryDto,
    @Req() req: Request,
    @User() user?: UserPayload,
  ) {
    const requestId =
      req.id || (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

    let userId: string;
    if (user?.id) userId = String(user.id);
    else if (process.env.NODE_ENV === 'production')
      throw new UnauthorizedException();
    else userId = '999999';

    const data: GetInterviewReportsDataDto =
      await this.interviewService.getReports(userId, query);
    return new SuccessResponseDto(data, requestId);
  }

  @Get(':interviewId/report')
  @DevPublic() // 개발 환경에서 인증 없이 테스트 가능
  @ApiOperation({
    summary: '면접 리포트 조회',
    description:
      '면접 종료 후 AI 리포트 생성 상태/결과를 조회합니다. 개발 환경에서는 인증 없이 사용 가능합니다.',
  })
  @ApiParam({
    name: 'interviewId',
    example: 'intv_123',
    description: '면접 ID',
  })
  @ApiOkResponse({
    type: GetInterviewReportResponseDto,
    description: '면접 리포트 조회 성공',
    example: {
      success: true,
      code: 'SUCCESS',
      data: {
        interviewId: 'intv_123',
        title: '2026-02-21 (01)',
        interviewStatus: 'DONE',
        report: {
          status: 'done',
          totalScore: 82.5,
          durationSec: 615,
          model: 'gpt-5-nano',
          promptVersion: 'v1',
          generatedAt: '2026-02-21T03:20:00.000Z',
          result: {
            summary:
              '전반적으로 논리적인 답변을 제시했으며, 일부 문항에서 수치 기반 근거를 보완하면 설득력이 높아진다.',
            strengths: ['답변 구조가 명확하다.'],
            weaknesses: ['정량 근거가 부족하다.'],
          },
          view: {
            header: {
              title: '2026-02-21 (01)',
              summary:
                '전반적으로 논리적인 답변을 제시했으며, 일부 문항에서 수치 기반 근거를 보완하면 설득력이 높아진다.',
              generatedAt: '2026-02-21T03:20:00.000Z',
            },
            summary: {
              totalScore: 82.5,
              strengths: ['답변 구조가 명확하다.'],
              weaknesses: ['정량 근거가 부족하다.'],
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
              actionItems: ['성과 수치를 포함해 답변해라.'],
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
        },
      },
      meta: {
        requestId: 'req_1700000000000',
        timestamp: '2026-02-21T03:20:01.000Z',
      },
    },
  })
  async getReport(
    @Param('interviewId') interviewId: string,
    @Req() req: Request,
    @User() user?: UserPayload,
  ) {
    const requestId =
      req.id || (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

    let userId: string;
    if (user?.id) userId = String(user.id);
    else if (process.env.NODE_ENV === 'production')
      throw new UnauthorizedException();
    else userId = '999999';

    const data: GetInterviewReportDataDto =
      await this.interviewService.getReport(interviewId, userId);
    return new SuccessResponseDto(data, requestId);
  }

  @Post(':interviewId/report/regenerate')
  @DevPublic() // 개발 환경에서 인증 없이 테스트 가능
  @ApiOperation({
    summary: '면접 리포트 AI 재생성',
    description:
      '완료/실패된 면접의 리포트를 AI로 다시 생성합니다. 개발 환경에서는 인증 없이 사용 가능합니다.',
  })
  @ApiParam({
    name: 'interviewId',
    example: 'intv_123',
    description: '면접 ID',
  })
  @ApiOkResponse({
    type: RegenerateInterviewReportResponseDto,
    description: '리포트 재생성 요청 성공',
    example: {
      success: true,
      code: 'SUCCESS',
      data: {
        interviewId: 'intv_123',
        status: 'ANALYZING',
        message: 'AI 리포트 재생성을 시작했습니다.',
      },
      meta: {
        requestId: 'req_1700000000100',
        timestamp: '2026-02-21T03:21:00.000Z',
      },
    },
  })
  async regenerateReport(
    @Param('interviewId') interviewId: string,
    @Req() req: Request,
    @User() user?: UserPayload,
  ) {
    const requestId =
      req.id || (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

    let userId: string;
    if (user?.id) userId = String(user.id);
    else if (process.env.NODE_ENV === 'production')
      throw new UnauthorizedException();
    else userId = '999999';

    const data: RegenerateInterviewReportDataDto =
      await this.interviewService.regenerateReport(interviewId, userId);
    return new SuccessResponseDto(data, requestId);
  }
}
