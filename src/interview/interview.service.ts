import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { CreateInterviewDataDto } from './dto/create-interview-response.dto';
import {
  SubmitTurnDto,
  FaceMetricsDto,
  VoiceMetricsDto,
} from './dto/submit-turn.dto';
import { SubmitTurnDataDto } from './dto/submit-turn-response.dto';
import { AiService, type GeneratedQuestion } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { ReportService } from '../report/report.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginationMetaDto } from '../common/dto/response.dto';
import { GetInterviewReportsDataDto } from './dto/get-interview-reports-response.dto';

const MAX_TURNS = 10;
const MAX_CONSECUTIVE_FOLLOWUP = 2;
const DEFAULT_TOTAL_LIMIT_SEC = 10 * 60;
const DEFAULT_TURN_LIMIT_SEC = 60;

type ReportTabView = {
  header: {
    title: string;
    summary: string;
    generatedAt: string | null;
  };
  summary: {
    totalScore: number | null;
    strengths: string[];
    weaknesses: string[];
    competencies: Array<{
      key: string;
      label: string;
      level: string;
      score: number | null;
      comment: string;
    }>;
  };
  analysis: {
    textPatternIssues: Array<{
      type: string;
      severity: string;
      description: string;
      affectedTurnIndexes: number[];
    }>;
    perTurnScores: Array<{ turnIndex: number; score: number | null }>;
  };
  coaching: {
    actionItems: string[];
    turnSuggestions: Array<{
      turnIndex: number;
      question: string;
      weakness: string | null;
      suggestion: string | null;
    }>;
  };
  record: {
    turns: Array<{
      turnIndex: number;
      questionType: 'base' | 'followup';
      questionText: string;
      answerText: string;
      score: number | null;
      feedback: string | null;
      highlight: {
        strength: string | null;
        weakness: string | null;
        suggestion: string | null;
      } | null;
      submittedAt: string | null;
      metrics: Record<string, unknown> | null;
    }>;
  };
};

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
    private readonly reportService: ReportService,
  ) {}

  private parseUserId(userId: string): bigint | null {
    try {
      return BigInt(userId);
    } catch {
      return null;
    }
  }

  private toDatePrefix(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toDateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toMonthDay(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  }

  private formatDurationKorean(totalSec: number): string {
    const safeSec = Number.isFinite(totalSec) ? Math.max(0, Math.floor(totalSec)) : 0;
    const minutes = Math.floor(safeSec / 60);
    const seconds = safeSec % 60;
    return `${minutes}분 ${String(seconds).padStart(2, '0')}초`;
  }

  private toSafeRecordId(value: bigint | number): number {
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber) || asNumber <= 0) return 0;
    return Math.floor(asNumber);
  }

  private extractRecordMetrics(
    reportResultJson: Prisma.JsonValue | null | undefined,
  ): {
    logic: number;
    clarity: number;
    eyeContact: number;
    voice: number;
    star: number;
    time: number;
  } {
    const metrics = {
      logic: 0,
      clarity: 0,
      eyeContact: 0,
      voice: 0,
      star: 0,
      time: 0,
    };

    const report = this.toJsonObject(reportResultJson);
    if (!report) return metrics;

    const competencies =
      report.competencies &&
      typeof report.competencies === 'object' &&
      !Array.isArray(report.competencies)
        ? (report.competencies as Record<string, unknown>)
        : null;
    const items = Array.isArray(competencies?.items) ? competencies.items : [];

    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;
      const key = typeof obj.key === 'string' ? obj.key : '';
      const score = this.toFiniteNumber(obj.score);
      if (score === null) continue;

      switch (key) {
        case 'LOGIC':
          metrics.logic = score;
          break;
        case 'SPECIFICITY':
          metrics.clarity = score;
          break;
        case 'EYE_CONTACT':
          metrics.eyeContact = score;
          break;
        case 'VOICE_TONE':
          metrics.voice = score;
          break;
        case 'STAR_METHOD':
          metrics.star = score;
          break;
        case 'TIME_MANAGEMENT':
          metrics.time = score;
          break;
        default:
          break;
      }
    }

    return metrics;
  }

  private async resolveInterviewTitle(rawTitle?: string): Promise<string> {
    const trimmed = rawTitle?.trim();
    if (trimmed) return trimmed;

    const datePrefix = this.toDatePrefix(new Date());
    const pattern = new RegExp(`^${datePrefix} \\((\\d+)\\)$`);

    const rows = await this.prisma.interviewSession.findMany({
      where: { title: { startsWith: `${datePrefix} (` } },
      select: { title: true },
    });

    let maxSeq = 0;
    for (const row of rows) {
      if (!row.title) continue;
      const match = row.title.match(pattern);
      if (!match) continue;
      const seq = Number.parseInt(match[1], 10);
      if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
    }

    const nextSeq = String(maxSeq + 1).padStart(2, '0');
    return `${datePrefix} (${nextSeq})`;
  }

  private toApiStatus(
    status: 'in_progress' | 'analyzing' | 'done' | 'failed',
  ): 'IN_PROGRESS' | 'ANALYZING' | 'DONE' | 'FAILED' {
    switch (status) {
      case 'in_progress':
        return 'IN_PROGRESS';
      case 'analyzing':
        return 'ANALYZING';
      case 'done':
        return 'DONE';
      case 'failed':
        return 'FAILED';
    }
  }

  private mergeMetricsJson(
    previous: Prisma.JsonValue | null | undefined,
    next: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const base =
      previous && typeof previous === 'object' && !Array.isArray(previous)
        ? (previous as Record<string, unknown>)
        : {};
    return { ...base, ...next } as Prisma.InputJsonObject;
  }

  private parseSessionTopic(topic: string | null): {
    mainTopicId: string;
    subTopicIds: string[];
  } {
    if (!topic) return { mainTopicId: 'unknown', subTopicIds: [] };

    try {
      const parsed = JSON.parse(topic) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'mainTopicId' in parsed &&
        typeof (parsed as { mainTopicId?: unknown }).mainTopicId === 'string'
      ) {
        const mainTopicId = (parsed as { mainTopicId: string }).mainTopicId;
        const subTopicIdsRaw = (parsed as { subTopicIds?: unknown }).subTopicIds;
        const subTopicIds = Array.isArray(subTopicIdsRaw)
          ? subTopicIdsRaw.filter((v) => typeof v === 'string')
          : [];
        return { mainTopicId, subTopicIds };
      }
    } catch {
      // ignore
    }

    return { mainTopicId: topic, subTopicIds: [] };
  }

  private toJsonObject(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }

  private toStringValue(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
  }

  private toNumberArray(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is number => typeof item === 'number' && Number.isFinite(item),
    );
  }

  private normalizeReportView(params: {
    interviewId: string;
    title: string | null;
    reportTotalScore: number | null;
    reportGeneratedAt: Date | null;
    reportResultJson: Prisma.JsonValue | null;
    turns: Array<{
      turnIndex: number;
      questionType: 'base' | 'followup';
      questionText: string;
      answerText: string;
      submittedAt: Date | null;
      metricsJson: Prisma.JsonValue | null;
    }>;
  }): ReportTabView {
    const {
      interviewId,
      title,
      reportTotalScore,
      reportGeneratedAt,
      reportResultJson,
      turns,
    } = params;
    const report = this.toJsonObject(reportResultJson);
    const perTurnFeedbackRaw = Array.isArray(report?.perTurnFeedback)
      ? report.perTurnFeedback
      : [];
    const perTurnFeedbackMap = new Map<
      number,
      {
        score: number | null;
        feedback: string | null;
        highlight: {
          strength: string | null;
          weakness: string | null;
          suggestion: string | null;
        } | null;
      }
    >();

    for (const item of perTurnFeedbackRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;
      const turnIndex = this.toNumber(obj.turnIndex);
      if (!turnIndex) continue;

      const highlightRaw =
        obj.highlight && typeof obj.highlight === 'object' && !Array.isArray(obj.highlight)
          ? (obj.highlight as Record<string, unknown>)
          : null;

      perTurnFeedbackMap.set(turnIndex, {
        score: this.toNumber(obj.score),
        feedback:
          typeof obj.feedback === 'string' && obj.feedback.trim().length > 0
            ? obj.feedback
            : null,
        highlight: highlightRaw
          ? {
              strength:
                typeof highlightRaw.strength === 'string'
                  ? highlightRaw.strength
                  : null,
              weakness:
                typeof highlightRaw.weakness === 'string'
                  ? highlightRaw.weakness
                  : null,
              suggestion:
                typeof highlightRaw.suggestion === 'string'
                  ? highlightRaw.suggestion
                  : null,
            }
          : null,
      });
    }

    const competenciesRaw =
      report?.competencies &&
      typeof report.competencies === 'object' &&
      !Array.isArray(report.competencies)
        ? (report.competencies as Record<string, unknown>)
        : null;
    const competencyItemsRaw = Array.isArray(competenciesRaw?.items)
      ? competenciesRaw.items
      : [];

    const competencies = competencyItemsRaw
      .filter((item): item is Record<string, unknown> => {
        return !!item && typeof item === 'object' && !Array.isArray(item);
      })
      .map((item) => ({
        key: this.toStringValue(item.key, 'UNKNOWN'),
        label: this.toStringValue(item.label, '미분류'),
        level: this.toStringValue(item.level, '보통'),
        score: this.toNumber(item.score),
        comment: this.toStringValue(item.comment, ''),
      }));

    const textPatternRaw =
      report?.textPatternAnalysis &&
      typeof report.textPatternAnalysis === 'object' &&
      !Array.isArray(report.textPatternAnalysis)
        ? (report.textPatternAnalysis as Record<string, unknown>)
        : null;
    const textPatternIssuesRaw = Array.isArray(textPatternRaw?.issues)
      ? textPatternRaw.issues
      : [];

    const textPatternIssues = textPatternIssuesRaw
      .filter((item): item is Record<string, unknown> => {
        return !!item && typeof item === 'object' && !Array.isArray(item);
      })
      .map((item) => ({
        type: this.toStringValue(item.type, '기타'),
        severity: this.toStringValue(item.severity, 'INFO'),
        description: this.toStringValue(item.description, ''),
        affectedTurnIndexes: this.toNumberArray(item.affectedTurnIndexes),
      }));

    const recordTurns = turns.map((turn) => {
      const feedback = perTurnFeedbackMap.get(turn.turnIndex);
      const metrics = this.toJsonObject(turn.metricsJson);

      return {
        turnIndex: turn.turnIndex,
        questionType: turn.questionType,
        questionText: turn.questionText,
        answerText: turn.answerText,
        score: feedback?.score ?? null,
        feedback: feedback?.feedback ?? null,
        highlight: feedback?.highlight ?? null,
        submittedAt: turn.submittedAt ? turn.submittedAt.toISOString() : null,
        metrics,
      };
    });

    const actionItems = [
      ...this.toStringArray(report?.weaknesses),
      ...recordTurns
        .map((turn) => turn.highlight?.suggestion)
        .filter((item): item is string => !!item && item.trim().length > 0),
    ].slice(0, 6);

    return {
      header: {
        title: title ?? `${interviewId} 면접 결과 리포트`,
        summary: this.toStringValue(
          report?.summary,
          '아직 분석 결과가 충분하지 않아 요약 정보를 생성하지 못했다.',
        ),
        generatedAt: reportGeneratedAt ? reportGeneratedAt.toISOString() : null,
      },
      summary: {
        totalScore: this.toNumber(report?.totalScore) ?? reportTotalScore,
        strengths: this.toStringArray(report?.strengths),
        weaknesses: this.toStringArray(report?.weaknesses),
        competencies,
      },
      analysis: {
        textPatternIssues,
        perTurnScores: recordTurns.map((turn) => ({
          turnIndex: turn.turnIndex,
          score: turn.score,
        })),
      },
      coaching: {
        actionItems,
        turnSuggestions: recordTurns
          .filter((turn) => turn.highlight?.weakness || turn.highlight?.suggestion)
          .map((turn) => ({
            turnIndex: turn.turnIndex,
            question: turn.questionText,
            weakness: turn.highlight?.weakness ?? null,
            suggestion: turn.highlight?.suggestion ?? null,
          })),
      },
      record: {
        turns: recordTurns,
      },
    };
  }

  private isInsufficientQuotaError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const e = error as {
      status?: unknown;
      code?: unknown;
      type?: unknown;
      error?: { code?: unknown; type?: unknown };
    };

    return (
      e.status === 429 &&
      (e.code === 'insufficient_quota' ||
        e.type === 'insufficient_quota' ||
        e.error?.code === 'insufficient_quota' ||
        e.error?.type === 'insufficient_quota')
    );
  }

  private isRateLimitError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const e = error as { status?: unknown };
    return e.status === 429;
  }

  private mapAiQuestionError(
    error: unknown,
    fallbackMessage: string,
  ): BadRequestException | HttpException | ServiceUnavailableException {
    if (this.isInsufficientQuotaError(error)) {
      return new ServiceUnavailableException(
        'AI 서비스 사용량 한도를 초과했습니다. 관리자에게 문의하거나 잠시 후 다시 시도해주세요.',
      );
    }

    if (this.isRateLimitError(error)) {
      return new HttpException(
        'AI 요청이 일시적으로 많습니다. 잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return new BadRequestException(fallbackMessage);
  }

  async createAndStart(
    dto: CreateInterviewDto,
    userId: string,
  ): Promise<CreateInterviewDataDto> {
    // 1) 토픽 조합 검증
    if (!dto.mainTopicId) {
      throw new BadRequestException('mainTopicId is required');
    }

    if (!dto.subTopicIds || dto.subTopicIds.length === 0) {
      throw new BadRequestException('At least one subTopicId is required');
    }

    this.logger.log(
      `면접 생성 시작 - 사용자: ${userId}, 주제: ${dto.mainTopicId}`,
    );

    // 2) 면접 row 생성 (status=IN_PROGRESS, turnIndex=1)
    const interviewId = `intv_${Date.now()}`;

    // 3) AI로 첫 질문 생성
    let firstQuestion: GeneratedQuestion;
    try {
      firstQuestion = await this.aiService.generateInterviewQuestion({
        mainTopicId: dto.mainTopicId,
        subTopicIds: dto.subTopicIds,
        turnIndex: 1,
        previousQuestions: [],
      });

      this.logger.log(`첫 질문 생성 완료: ${firstQuestion.questionId}`);
    } catch (error) {
      this.logger.error('AI 질문 생성 실패', error);
      throw this.mapAiQuestionError(
        error,
        '질문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    // 4) DB 저장: session + 첫 질문 turn 생성
    const startedAt = new Date();
    const resolvedTitle = await this.resolveInterviewTitle(dto.title);
    const parsedUserId = this.parseUserId(userId);
    const dbUserId = parsedUserId
      ? (await this.prisma.user.findUnique({
          where: { id: parsedUserId },
          select: { id: true },
        }))?.id ?? null
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.interviewSession.create({
        data: {
          sessionId: interviewId,
          userId: dbUserId,
          title: resolvedTitle,
          // subTopicIds까지 포함해 재시작/스케일아웃에서도 다음 질문 생성 가능하도록 JSON 문자열로 저장
          topic: JSON.stringify({
            mainTopicId: dto.mainTopicId,
            subTopicIds: dto.subTopicIds,
          }),
          status: 'in_progress',
          currentTurn: 1,
          followupStreak: 0,
          totalLimitSec: DEFAULT_TOTAL_LIMIT_SEC,
          turnLimitSec: DEFAULT_TURN_LIMIT_SEC,
          startedAt,
        },
      });

      await tx.interviewTurn.create({
        data: {
          sessionId: interviewId,
          turnIndex: 1,
          questionType: 'base',
          questionText: firstQuestion.text,
          // answerText는 schema 상 필수라 초기값으로 빈 문자열 저장
          answerText: '',
          metricsJson: { questionId: firstQuestion.questionId },
        },
      });
    });

    // 5) 토픽 라벨 매핑(프론트 편의용)
    // TODO: 실제 토픽 정보를 DB에서 조회하여 라벨 가져오기
    const main = { id: dto.mainTopicId, label: dto.mainTopicId };
    const subs = dto.subTopicIds.map((id) => ({ id, label: id }));

    // 6) 응답 구성
    return {
      interviewId,
      topics: { main, subs },
      status: 'IN_PROGRESS',
      turnIndex: 1,
      firstQuestion,
    };
  }

  /**
   * 턴 제출 및 다음 질문 생성
   */
  async submitTurn(
    interviewId: string,
    dto: SubmitTurnDto,
    userId: string,
  ): Promise<SubmitTurnDataDto> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { sessionId: interviewId },
      include: {
        turns: {
          orderBy: { turnIndex: 'asc' },
          select: { turnIndex: true, questionText: true, metricsJson: true },
        },
      },
    });
    if (!session) throw new NotFoundException(`면접을 찾을 수 없습니다: ${interviewId}`);

    const sessionUserId = session.userId ? String(session.userId) : null;
    if (sessionUserId && sessionUserId !== userId) {
      throw new BadRequestException('면접에 대한 권한이 없습니다');
    }

    if (session.status !== 'in_progress') {
      throw new BadRequestException(
        `면접이 진행 중이 아닙니다. 현재 상태: ${this.toApiStatus(session.status)}`,
      );
    }

    if (dto.turnIndex !== session.currentTurn) {
      throw new BadRequestException(
        `턴 순서가 일치하지 않습니다. 예상: ${session.currentTurn}, 받음: ${dto.turnIndex}`,
      );
    }

    this.logger.log(
      `턴 제출 - 면접: ${interviewId}, 턴: ${dto.turnIndex}, 사용자: ${userId}`,
    );

    const currentTurn = session.turns.find((t) => t.turnIndex === dto.turnIndex);
    if (!currentTurn) {
      throw new BadRequestException(
        `현재 턴 질문 데이터가 없습니다. sessionId=${interviewId}, turnIndex=${dto.turnIndex}`,
      );
    }

    const updatedMetrics = this.mergeMetricsJson(currentTurn.metricsJson, {
      answerDuration: dto.answerDuration,
      faceMetrics: dto.faceMetrics as FaceMetricsDto | undefined,
      voiceMetrics: dto.voiceMetrics as VoiceMetricsDto | undefined,
      isFollowupQuestion: dto.isFollowupQuestion === true,
    });

    await this.prisma.interviewTurn.update({
      where: {
        sessionId_turnIndex: { sessionId: interviewId, turnIndex: dto.turnIndex },
      },
      data: {
        answerText: dto.answerText,
        metricsJson: updatedMetrics,
        submittedAt: new Date(),
      },
    });

    // 6) 10턴 완료 확인 (10번째 답변까지 제출되면 완료)
    const isComplete = dto.turnIndex >= MAX_TURNS;

    if (isComplete) {
      // 10턴 완료 - 분석 상태로 변경
      const endedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.interviewSession.update({
          where: { sessionId: interviewId },
          data: {
            status: 'analyzing',
            endedAt,
            currentTurn: MAX_TURNS,
          },
        });

        await tx.interviewReport.upsert({
          where: { sessionId: interviewId },
          create: { sessionId: interviewId, status: 'analyzing' },
          update: { status: 'analyzing', generatedAt: null },
        });
      });

      this.logger.log(`면접 완료 - ${interviewId}, 분석 상태로 전환`);

      // 리포트 생성은 백그라운드로 실행 (요청 응답은 즉시 반환)
      setImmediate(() => {
        void this.reportService.generateForSession(interviewId).catch((err) => {
          this.logger.error('리포트 생성 실패', err);
        });
      });

      return {
        interviewId,
        nextTurnIndex: null,
        status: 'ANALYZING',
        nextQuestion: null,
        success: true,
        message: '면접이 완료되었습니다. 결과를 분석 중입니다.',
        consecutiveFollowupCount: session.followupStreak,
        remainingFollowupCount: Math.max(
          0,
          MAX_CONSECUTIVE_FOLLOWUP - session.followupStreak,
        ),
      };
    }

    // 7) 다음 질문 생성
    let nextQuestion: GeneratedQuestion;
    let questionType: 'base' | 'followup';
    let nextFollowupStreak: number;
    try {
      // 이전 질문들 텍스트 추출
      const previousQuestions = session.turns.map((q) => q.questionText);
      const { mainTopicId, subTopicIds } = this.parseSessionTopic(session.topic);

      // 꼬리질문 요청 여부 확인
      const requestedFollowup = dto.isFollowupQuestion === true;

      // 연속 꼬리질문 횟수 체크: 최대 2번까지 허용
      const canCreateFollowup =
        requestedFollowup &&
        session.followupStreak < MAX_CONSECUTIVE_FOLLOWUP;

      // 꼬리질문 생성 여부 결정
      const isFollowup = canCreateFollowup;

      if (requestedFollowup && !canCreateFollowup) {
        this.logger.log(
          `꼬리질문 요청이 있었지만 연속 횟수 제한(${MAX_CONSECUTIVE_FOLLOWUP}회)에 도달하여 일반 질문으로 생성합니다. (현재 연속 횟수: ${session.followupStreak})`,
        );
      }

      nextQuestion = await this.aiService.generateInterviewQuestion({
        mainTopicId,
        subTopicIds,
        turnIndex: dto.turnIndex + 1,
        previousQuestions,
        answerText: isFollowup ? dto.answerText : undefined,
        isFollowup,
      });

      questionType = isFollowup ? 'followup' : 'base';

      // 연속 꼬리질문 횟수 업데이트
      if (questionType === 'followup') {
        nextFollowupStreak = session.followupStreak + 1;
      } else {
        // 일반 질문이 생성되면 연속 횟수 리셋
        nextFollowupStreak = 0;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.interviewSession.update({
          where: { sessionId: interviewId },
          data: {
            currentTurn: dto.turnIndex + 1,
            followupStreak: nextFollowupStreak,
          },
        });

        await tx.interviewTurn.upsert({
          where: {
            sessionId_turnIndex: {
              sessionId: interviewId,
              turnIndex: dto.turnIndex + 1,
            },
          },
          create: {
            sessionId: interviewId,
            turnIndex: dto.turnIndex + 1,
            questionType,
            questionText: nextQuestion.text,
            answerText: '',
            metricsJson: { questionId: nextQuestion.questionId },
          },
          update: {
            questionType,
            questionText: nextQuestion.text,
            metricsJson: { questionId: nextQuestion.questionId },
          },
        });
      });

      this.logger.log(
        `다음 질문 생성 완료: ${nextQuestion.questionId} (턴 ${dto.turnIndex + 1}, 타입: ${questionType}, 연속 꼬리질문 횟수: ${nextFollowupStreak})`,
      );
    } catch (error) {
      this.logger.error('다음 질문 생성 실패', error);
      throw this.mapAiQuestionError(
        error,
        '다음 질문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    return {
      interviewId,
      nextTurnIndex: dto.turnIndex + 1,
      status: 'IN_PROGRESS',
      nextQuestion: {
        questionId: nextQuestion.questionId,
        text: nextQuestion.text,
        type: questionType,
      },
      success: true,
      message: '답변이 제출되었습니다',
      consecutiveFollowupCount: nextFollowupStreak,
      remainingFollowupCount: Math.max(
        0,
        MAX_CONSECUTIVE_FOLLOWUP - nextFollowupStreak,
      ),
    };
  }

  async getReport(
    interviewId: string,
    userId: string,
  ): Promise<{
    interviewId: string;
    title: string | null;
    interviewStatus: 'IN_PROGRESS' | 'ANALYZING' | 'DONE' | 'FAILED';
    report: {
      status: 'analyzing' | 'done' | 'failed';
      totalScore?: number;
      durationSec?: number;
      model?: string | null;
      promptVersion?: string | null;
      generatedAt?: string | null;
      result?: unknown;
      view?: ReportTabView;
    } | null;
  }> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { sessionId: interviewId },
      select: {
        sessionId: true,
        title: true,
        userId: true,
        status: true,
        report: {
          select: {
            status: true,
            totalScore: true,
            durationSec: true,
            model: true,
            promptVersion: true,
            generatedAt: true,
            resultJson: true,
          },
        },
        turns: {
          orderBy: { turnIndex: 'asc' },
          select: {
            turnIndex: true,
            questionType: true,
            questionText: true,
            answerText: true,
            submittedAt: true,
            metricsJson: true,
          },
        },
      },
    });

    if (!session) throw new NotFoundException(`면접을 찾을 수 없습니다: ${interviewId}`);

    const sessionUserId = session.userId ? String(session.userId) : null;
    if (sessionUserId && sessionUserId !== userId) {
      throw new BadRequestException('면접에 대한 권한이 없습니다');
    }

    const interviewStatus = this.toApiStatus(session.status);
    const report = session.report
      ? {
          status: session.report.status,
          ...(typeof session.report.totalScore === 'number'
            ? { totalScore: session.report.totalScore }
            : {}),
          ...(typeof session.report.durationSec === 'number'
            ? { durationSec: session.report.durationSec }
            : {}),
          model: session.report.model,
          promptVersion: session.report.promptVersion,
          generatedAt: session.report.generatedAt
            ? session.report.generatedAt.toISOString()
            : null,
          result: session.report.resultJson ?? undefined,
          view: this.normalizeReportView({
            interviewId: session.sessionId,
            title: session.title,
            reportTotalScore:
              typeof session.report.totalScore === 'number'
                ? session.report.totalScore
                : null,
            reportGeneratedAt: session.report.generatedAt,
            reportResultJson: session.report.resultJson,
            turns: session.turns.map((turn) => ({
              turnIndex: turn.turnIndex,
              questionType: turn.questionType,
              questionText: turn.questionText,
              answerText: turn.answerText,
              submittedAt: turn.submittedAt,
              metricsJson: turn.metricsJson,
            })),
          }),
        }
      : null;

    return {
      interviewId: session.sessionId,
      title: session.title,
      interviewStatus,
      report,
    };
  }

  async regenerateReport(
    interviewId: string,
    userId: string,
  ): Promise<{
    interviewId: string;
    status: 'ANALYZING';
    message: string;
  }> {
    const session = await this.prisma.interviewSession.findUnique({
      where: { sessionId: interviewId },
      select: {
        sessionId: true,
        userId: true,
        status: true,
        turns: {
          select: {
            turnIndex: true,
            answerText: true,
          },
        },
      },
    });

    if (!session) throw new NotFoundException(`면접을 찾을 수 없습니다: ${interviewId}`);

    const sessionUserId = session.userId ? String(session.userId) : null;
    if (sessionUserId && sessionUserId !== userId) {
      throw new BadRequestException('면접에 대한 권한이 없습니다');
    }

    if (session.status === 'in_progress') {
      throw new BadRequestException(
        '진행 중인 면접은 리포트를 재생성할 수 없습니다. 면접 종료 후 다시 시도해주세요.',
      );
    }

    const hasAnyAnswer = session.turns.some(
      (turn) => turn.answerText.trim().length > 0,
    );
    if (!hasAnyAnswer) {
      throw new BadRequestException(
        '제출된 답변이 없어 리포트를 생성할 수 없습니다.',
      );
    }

    await this.prisma.interviewSession.update({
      where: { sessionId: interviewId },
      data: { status: 'analyzing' },
    });
    await this.reportService.upsertAnalyzingReport(interviewId);

    setImmediate(() => {
      void this.reportService.generateForSession(interviewId).catch((err) => {
        this.logger.error(
          `리포트 재생성 실패 - sessionId=${interviewId}`,
          err,
        );
      });
    });

    return {
      interviewId,
      status: 'ANALYZING',
      message: 'AI 리포트 재생성을 시작했습니다.',
    };
  }

  async getReports(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<GetInterviewReportsDataDto> {
    const page = query.page || 1;
    const size = query.size || 10;
    const parsedUserId = this.parseUserId(userId);
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !parsedUserId) {
      throw new BadRequestException('잘못된 사용자 식별자입니다');
    }

    const where: Prisma.InterviewSessionWhereInput = isProduction
      ? { userId: parsedUserId ?? undefined }
      : parsedUserId
        ? { OR: [{ userId: parsedUserId }, { userId: null }] }
        : { userId: null };

    const [totalItems, sessions] = await this.prisma.$transaction([
      this.prisma.interviewSession.count({ where }),
      this.prisma.interviewSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
        select: {
          sessionId: true,
          title: true,
          status: true,
          createdAt: true,
          report: {
            select: {
              status: true,
              totalScore: true,
              resultJson: true,
              generatedAt: true,
            },
          },
        },
      }),
    ]);

    const items = sessions.map((session) => {
      const reportJson =
        session.report?.resultJson &&
        typeof session.report.resultJson === 'object' &&
        !Array.isArray(session.report.resultJson)
          ? (session.report.resultJson as Record<string, unknown>)
          : null;
      const fallbackScore = this.toFiniteNumber(reportJson?.totalScore);

      return {
        interviewId: session.sessionId,
        title: session.title,
        interviewStatus: this.toApiStatus(session.status),
        reportStatus: session.report?.status ?? null,
        totalScore:
          typeof session.report?.totalScore === 'number'
            ? session.report.totalScore
            : fallbackScore,
        generatedAt: session.report?.generatedAt
          ? session.report.generatedAt.toISOString()
          : null,
        createdAt: session.createdAt.toISOString(),
      };
    });

    const pageMeta = new PaginationMetaDto(page, size, totalItems);

    return {
      items,
      page: {
        number: pageMeta.number,
        size: pageMeta.size,
        totalItems: pageMeta.totalItems,
        totalPages: pageMeta.totalPages,
        hasNext: pageMeta.hasNext,
        hasPrev: pageMeta.hasPrev,
      },
    };
  }

  async getInterviewRecords(userId: string): Promise<
    Array<{
      id: number;
      score: number;
      date: string;
      duration: string;
      questionProgress: string;
      strengths: string[];
      improvements: string[];
      metrics: {
        logic: number;
        clarity: number;
        eyeContact: number;
        voice: number;
        star: number;
        time: number;
      };
    }>
  > {
    const parsedUserId = this.parseUserId(userId);
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !parsedUserId) {
      throw new BadRequestException('잘못된 사용자 식별자입니다');
    }

    const where: Prisma.InterviewSessionWhereInput = isProduction
      ? { userId: parsedUserId ?? undefined, report: { is: { status: 'done' } } }
      : parsedUserId
        ? {
            report: { is: { status: 'done' } },
            OR: [{ userId: parsedUserId }, { userId: null }],
          }
        : { userId: null, report: { is: { status: 'done' } } };

    const sessions = await this.prisma.interviewSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        sessionId: true,
        createdAt: true,
        startedAt: true,
        endedAt: true,
        turns: {
          select: {
            answerText: true,
          },
        },
        report: {
          select: {
            reportId: true,
            totalScore: true,
            durationSec: true,
            generatedAt: true,
            resultJson: true,
          },
        },
      },
    });

    return sessions
      .filter((session): session is typeof session & { report: NonNullable<typeof session.report> } => !!session.report)
      .map((session) => {
        const reportJson =
          session.report.resultJson &&
          typeof session.report.resultJson === 'object' &&
          !Array.isArray(session.report.resultJson)
            ? (session.report.resultJson as Record<string, unknown>)
            : null;
        const totalScore = this.toFiniteNumber(session.report.totalScore) ?? this.toFiniteNumber(reportJson?.totalScore) ?? 0;
        const strengths = this.toStringArray(reportJson?.strengths);
        const improvements = this.toStringArray(reportJson?.weaknesses);
        const answeredCount = session.turns.filter(
          (turn) => turn.answerText.trim().length > 0,
        ).length;
        const durationSec =
          session.report.durationSec ??
          (session.endedAt
            ? Math.max(
                0,
                Math.floor(
                  (session.endedAt.getTime() - session.startedAt.getTime()) / 1000,
                ),
              )
            : 0);

        return {
          id: this.toSafeRecordId(session.report.reportId),
          score: totalScore,
          date: this.toDateOnly(session.report.generatedAt ?? session.createdAt),
          duration: this.formatDurationKorean(durationSec),
          questionProgress: `${answeredCount}/${MAX_TURNS} 질문 완료`,
          strengths,
          improvements,
          metrics: this.extractRecordMetrics(session.report.resultJson),
        };
      });
  }

  async getInterviewScoreTrend(userId: string): Promise<
    Array<{
      date: string;
      score: number;
    }>
  > {
    const parsedUserId = this.parseUserId(userId);
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !parsedUserId) {
      throw new BadRequestException('잘못된 사용자 식별자입니다');
    }

    const where: Prisma.InterviewSessionWhereInput = isProduction
      ? { userId: parsedUserId ?? undefined, report: { is: { status: 'done' } } }
      : parsedUserId
        ? {
            report: { is: { status: 'done' } },
            OR: [{ userId: parsedUserId }, { userId: null }],
          }
        : { userId: null, report: { is: { status: 'done' } } };

    const sessions = await this.prisma.interviewSession.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        report: {
          select: {
            totalScore: true,
            generatedAt: true,
            resultJson: true,
          },
        },
      },
    });

    return sessions
      .filter((session): session is typeof session & { report: NonNullable<typeof session.report> } => !!session.report)
      .map((session) => {
        const reportJson =
          session.report.resultJson &&
          typeof session.report.resultJson === 'object' &&
          !Array.isArray(session.report.resultJson)
            ? (session.report.resultJson as Record<string, unknown>)
            : null;
        const score =
          this.toFiniteNumber(session.report.totalScore) ??
          this.toFiniteNumber(reportJson?.totalScore) ??
          0;
        const pointDate = session.report.generatedAt ?? session.createdAt;

        return {
          date: this.toMonthDay(pointDate),
          score,
        };
      });
  }
}
