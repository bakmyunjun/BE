import { Body, Controller, Post, Req, UseGuards, Param } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
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
import { User, type UserPayload } from '../auth/decorators/user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('interviews')
@Controller('interviews')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post()
  @Public() // 개발 환경에서 인증 없이 테스트 가능
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
    const userId = user?.id ? String(user.id) : '999999';

    const data: CreateInterviewDataDto =
      await this.interviewService.createAndStart(dto, userId);

    return new SuccessResponseDto(data, requestId);
  }

  @Post(':interviewId/turns')
  @Public() // 개발 환경에서 인증 없이 테스트 가능
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
    const userId = user?.id ? String(user.id) : '999999';

    const data: SubmitTurnDataDto = await this.interviewService.submitTurn(
      interviewId,
      dto,
      userId,
    );

    return new SuccessResponseDto(data, requestId);
  }
}
