import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CreateInterviewDto } from './dto/create-interview.dto';
import { CreateInterviewDataDto } from './dto/create-interview-response.dto';
import {
  SubmitTurnDto,
  FaceMetricsDto,
  VoiceMetricsDto,
} from './dto/submit-turn.dto';
import { SubmitTurnDataDto } from './dto/submit-turn-response.dto';
import { AiService, type GeneratedQuestion } from '../ai/ai.service';

/**
 * 면접 데이터 (임시 메모리 저장용)
 * TODO: DB로 교체
 */
interface InterviewData {
  id: string;
  userId: string;
  title: string;
  mainTopicId: string;
  subTopicIds: string[];
  status: 'IN_PROGRESS' | 'ANALYZING' | 'DONE' | 'FAILED';
  currentTurnIndex: number;
  consecutiveFollowupCount: number; // 연속 꼬리질문 횟수 추적
  questions: Array<{ questionId: string; text: string; type: string }>;
  answers: Array<{
    turnIndex: number;
    answerText: string;
    answerDuration: number;
    faceMetrics?: FaceMetricsDto;
    voiceMetrics?: VoiceMetricsDto;
  }>;
  createdAt: Date;
}

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);
  // 임시 메모리 저장소 (추후 DB로 교체)
  private readonly interviewStore = new Map<string, InterviewData>();

  constructor(private readonly aiService: AiService) {}

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

    // 4) 메모리에 면접 데이터 저장 (TODO: DB로 교체)
    this.interviewStore.set(interviewId, {
      id: interviewId,
      userId,
      title: dto.title,
      mainTopicId: dto.mainTopicId,
      subTopicIds: dto.subTopicIds,
      status: 'IN_PROGRESS',
      currentTurnIndex: 1,
      consecutiveFollowupCount: 0, // 초기 연속 꼬리질문 횟수는 0
      questions: [
        {
          questionId: firstQuestion.questionId,
          text: firstQuestion.text,
          type: 'base',
        },
      ],
      answers: [],
      createdAt: new Date(),
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
    // 1) 면접 데이터 조회
    const interview = this.interviewStore.get(interviewId);
    if (!interview) {
      throw new NotFoundException(`면접을 찾을 수 없습니다: ${interviewId}`);
    }

    // 2) 권한 확인
    if (interview.userId !== userId) {
      throw new BadRequestException('면접에 대한 권한이 없습니다');
    }

    // 3) 상태 확인
    if (interview.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `면접이 진행 중이 아닙니다. 현재 상태: ${interview.status}`,
      );
    }

    // 4) 턴 순서 확인
    if (dto.turnIndex !== interview.currentTurnIndex) {
      throw new BadRequestException(
        `턴 순서가 일치하지 않습니다. 예상: ${interview.currentTurnIndex}, 받음: ${dto.turnIndex}`,
      );
    }

    this.logger.log(
      `턴 제출 - 면접: ${interviewId}, 턴: ${dto.turnIndex}, 사용자: ${userId}`,
    );

    // 5) 답변 저장
    interview.answers.push({
      turnIndex: dto.turnIndex,
      answerText: dto.answerText,
      answerDuration: dto.answerDuration,
      faceMetrics: dto.faceMetrics,
      voiceMetrics: dto.voiceMetrics,
    });

    // 6) 10턴 완료 확인 (10번째 답변까지 제출되면 완료)
    const isComplete = dto.turnIndex >= 10;

    if (isComplete) {
      // 10턴 완료 - 분석 상태로 변경
      interview.status = 'ANALYZING';
      interview.currentTurnIndex = 10;

      this.logger.log(`면접 완료 - ${interviewId}, 분석 상태로 전환`);

      const MAX_CONSECUTIVE_FOLLOWUP = 2;
      return {
        interviewId,
        nextTurnIndex: null,
        status: 'ANALYZING',
        nextQuestion: null,
        success: true,
        message: '면접이 완료되었습니다. 결과를 분석 중입니다.',
        consecutiveFollowupCount: interview.consecutiveFollowupCount,
        remainingFollowupCount: Math.max(
          0,
          MAX_CONSECUTIVE_FOLLOWUP - interview.consecutiveFollowupCount,
        ),
      };
    }

    // 7) 다음 질문 생성
    let nextQuestion: GeneratedQuestion;
    try {
      // 이전 질문들 텍스트 추출
      const previousQuestions = interview.questions.map((q) => q.text);

      // 꼬리질문 요청 여부 확인
      const requestedFollowup = dto.isFollowupQuestion === true;

      // 연속 꼬리질문 횟수 체크: 최대 2번까지 허용
      const MAX_CONSECUTIVE_FOLLOWUP = 2;
      const canCreateFollowup =
        requestedFollowup &&
        interview.consecutiveFollowupCount < MAX_CONSECUTIVE_FOLLOWUP;

      // 꼬리질문 생성 여부 결정
      const isFollowup = canCreateFollowup;

      if (requestedFollowup && !canCreateFollowup) {
        this.logger.log(
          `꼬리질문 요청이 있었지만 연속 횟수 제한(${MAX_CONSECUTIVE_FOLLOWUP}회)에 도달하여 일반 질문으로 생성합니다. (현재 연속 횟수: ${interview.consecutiveFollowupCount})`,
        );
      }

      nextQuestion = await this.aiService.generateInterviewQuestion({
        mainTopicId: interview.mainTopicId,
        subTopicIds: interview.subTopicIds,
        turnIndex: dto.turnIndex + 1,
        previousQuestions,
        answerText: isFollowup ? dto.answerText : undefined,
        isFollowup,
      });

      // 질문 유형 결정: 꼬리질문이면 "followup", 아니면 기존 로직 사용
      const questionType = isFollowup
        ? 'followup'
        : (dto.turnIndex + 1) % 3 === 1
          ? 'base'
          : 'followup';

      // 연속 꼬리질문 횟수 업데이트
      if (questionType === 'followup') {
        interview.consecutiveFollowupCount += 1;
      } else {
        // 일반 질문이 생성되면 연속 횟수 리셋
        interview.consecutiveFollowupCount = 0;
      }

      // 질문 저장
      interview.questions.push({
        questionId: nextQuestion.questionId,
        text: nextQuestion.text,
        type: questionType,
      });

      this.logger.log(
        `다음 질문 생성 완료: ${nextQuestion.questionId} (턴 ${dto.turnIndex + 1}, 타입: ${questionType}, 연속 꼬리질문 횟수: ${interview.consecutiveFollowupCount})`,
      );
    } catch (error) {
      this.logger.error('다음 질문 생성 실패', error);
      throw new BadRequestException(
        '다음 질문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    }

    // 8) 턴 증가
    interview.currentTurnIndex = dto.turnIndex + 1;

    // 9) 응답 구성
    const MAX_CONSECUTIVE_FOLLOWUP = 2;
    return {
      interviewId,
      nextTurnIndex: interview.currentTurnIndex,
      status: interview.status,
      nextQuestion: {
        questionId: nextQuestion.questionId,
        text: nextQuestion.text,
        type: interview.questions[interview.questions.length - 1].type as
          | 'base'
          | 'followup',
      },
      success: true,
      message: '답변이 제출되었습니다',
      consecutiveFollowupCount: interview.consecutiveFollowupCount,
      remainingFollowupCount: Math.max(
        0,
        MAX_CONSECUTIVE_FOLLOWUP - interview.consecutiveFollowupCount,
      ),
    };
  }
}
