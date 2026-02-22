import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { DevPublic } from '../auth/decorators/public.decorator';
import { User, type UserPayload } from '../auth/decorators/user.decorator';
import { SuccessResponseDto } from '../common/dto/response.dto';
import {
  GetReportSummaryResponseDto,
  ReportSummaryDto,
} from './dto/get-report-summary-response.dto';
import {
  GetReportTurnMetricsResponseDto,
  TurnMetricDataDto,
} from './dto/get-report-turn-metrics-response.dto';
import { ReportService } from './report.service';

@ApiTags('reports')
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get(':id/summary')
  @DevPublic()
  @ApiOperation({
    summary: '리포트 - 종합 역량 분석',
    description:
      '리포트 ID로 종합 역량 분석을 조회합니다. 개발 환경에서는 인증 없이 사용 가능합니다.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    example: 1,
    description: '리포트 ID',
  })
  @ApiOkResponse({ type: GetReportSummaryResponseDto })
  async getSummary(
    @Param('id') id: string,
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

    const reportId = Number(id);
    const data: ReportSummaryDto = await this.reportService.getReportSummary(
      reportId,
      userId,
    );
    return new SuccessResponseDto(data, requestId);
  }

  @Get(':id/turn-metrics')
  @DevPublic()
  @ApiOperation({
    summary: '리포트 - 턴별 지표',
    description:
      '리포트 ID로 턴별 답변 시간, 시선 이탈 비율, 침묵 비율을 조회합니다.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    example: 1,
    description: '리포트 ID',
  })
  @ApiOkResponse({ type: GetReportTurnMetricsResponseDto })
  async getTurnMetrics(
    @Param('id') id: string,
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

    const reportId = Number(id);
    const data: TurnMetricDataDto[] = await this.reportService.getTurnMetrics(
      reportId,
      userId,
    );
    return new SuccessResponseDto(data, requestId);
  }
}
