import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { InterviewService } from './interview.service';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { SuccessResponseDto } from '../common/dto/response.dto';
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
  @ApiOkResponse({ type: GetInterviewReportResponseDto })
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
}
