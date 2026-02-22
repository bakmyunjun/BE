import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { SuccessResponseDto } from '../common/dto/response.dto';
import { User, type UserPayload } from '../auth/decorators/user.decorator';
import { DevPublic } from '../auth/decorators/public.decorator';
import { InterviewService } from './interview.service';
import {
  GetInterviewRecordsResponseDto,
  InterviewRecordDto,
} from './dto/get-interview-records-response.dto';
import {
  GetInterviewScoreTrendResponseDto,
  ScoreTrendDataDto,
} from './dto/get-interview-score-trend-response.dto';

@ApiTags('interview')
@Controller('interview')
export class InterviewRecordController {
  constructor(private readonly interviewService: InterviewService) {}

  @Get('records')
  @DevPublic()
  @ApiOperation({
    summary: '홈 - 면접 기록 목록 조회',
    description:
      '홈 화면에 표시할 면접 기록 목록을 조회합니다. 개발 환경에서는 인증 없이 사용 가능합니다.',
  })
  @ApiOkResponse({ type: GetInterviewRecordsResponseDto })
  async getInterviewRecords(@Req() req: Request, @User() user?: UserPayload) {
    const requestId =
      req.id || (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

    let userId: string;
    if (user?.id) userId = String(user.id);
    else if (process.env.NODE_ENV === 'production')
      throw new UnauthorizedException();
    else userId = '999999';

    const data: InterviewRecordDto[] =
      await this.interviewService.getInterviewRecords(userId);
    return new SuccessResponseDto(data, requestId);
  }

  @Get('score-trend')
  @DevPublic()
  @ApiOperation({
    summary: '홈 - 점수 추이 차트 조회',
    description:
      '홈 화면의 점수 추이 차트 데이터를 조회합니다. 개발 환경에서는 인증 없이 사용 가능합니다.',
  })
  @ApiOkResponse({ type: GetInterviewScoreTrendResponseDto })
  async getScoreTrend(@Req() req: Request, @User() user?: UserPayload) {
    const requestId =
      req.id || (req.headers['x-request-id'] as string) || `req_${Date.now()}`;

    let userId: string;
    if (user?.id) userId = String(user.id);
    else if (process.env.NODE_ENV === 'production')
      throw new UnauthorizedException();
    else userId = '999999';

    const data: ScoreTrendDataDto[] =
      await this.interviewService.getInterviewScoreTrend(userId);
    return new SuccessResponseDto(data, requestId);
  }
}
