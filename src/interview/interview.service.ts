import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
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

const MAX_TURNS = 10;
const MAX_CONSECUTIVE_FOLLOWUP = 2;
const DEFAULT_TOTAL_LIMIT_SEC = 10 * 60;
const DEFAULT_TURN_LIMIT_SEC = 60;

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {}

  private parseUserId(userId: string): bigint | null {
    try {
      return BigInt(userId);
    } catch {
      return null;
    }
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
      throw new BadRequestException(
        '질문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
        );
    }

    // 4) DB 저장: session + 첫 질문 turn 생성
    const startedAt = new Date();
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
          title: dto.title,
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
      title: dto.title,
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
      await this.prisma.interviewSession.update({
        where: { sessionId: interviewId },
        data: {
          status: 'analyzing',
          endedAt: new Date(),
          currentTurn: MAX_TURNS,
        },
      });

      this.logger.log(`면접 완료 - ${interviewId}, 분석 상태로 전환`);

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

      // 질문 유형 결정: 꼬리질문이면 "followup", 아니면 기존 로직 사용
      questionType = isFollowup
        ? 'followup'
        : (dto.turnIndex + 1) % 3 === 1
          ? 'base'
          : 'followup';

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
      throw new BadRequestException(
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
}
