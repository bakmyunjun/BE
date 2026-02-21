import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { ReportService } from '../report/report.service';

describe('InterviewService', () => {
  let service: InterviewService;

  const mockAiService = {
    generateInterviewQuestion: jest.fn(),
    evaluateAnswer: jest.fn(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    interviewSession: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    interviewTurn: {
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockReportService = {
    generateForSession: jest.fn(),
    upsertAnalyzingReport: jest.fn(),
  };

  beforeEach(async () => {
    mockPrismaService.$transaction.mockImplementation(async (callback) =>
      callback(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewService,
        {
          provide: AiService,
          useValue: mockAiService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ReportService,
          useValue: mockReportService,
        },
      ],
    }).compile();

    service = module.get<InterviewService>(InterviewService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('maps OpenAI insufficient_quota to ServiceUnavailableException on create', async () => {
    mockAiService.generateInterviewQuestion.mockRejectedValueOnce({
      status: 429,
      code: 'insufficient_quota',
    });

    await expect(
      service.createAndStart(
        {
          title: '테스트 면접',
          mainTopicId: 'backend',
          subTopicIds: ['nestjs'],
        },
        '1',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('createAndStart response does not include title', async () => {
    mockPrismaService.interviewSession.findMany.mockResolvedValue([]);
    mockPrismaService.user.findUnique.mockResolvedValue({ id: BigInt(1) });
    mockPrismaService.interviewSession.create.mockResolvedValue({});
    mockPrismaService.interviewTurn.create.mockResolvedValue({});
    mockAiService.generateInterviewQuestion.mockResolvedValue({
      questionId: 'q_1',
      text: '첫 질문입니다?',
    });

    const result = await service.createAndStart(
      {
        title: '테스트 면접',
        mainTopicId: 'backend',
        subTopicIds: ['nestjs'],
      },
      '1',
    );

    expect(result).not.toHaveProperty('title');
    expect(result.interviewId).toBeDefined();
  });

  it('getReport response includes title', async () => {
    mockPrismaService.interviewSession.findUnique.mockResolvedValue({
      sessionId: 'intv_1',
      title: '백엔드 면접 1회차',
      userId: null,
      status: 'done',
      report: null,
    });

    const result = await service.getReport('intv_1', '999999');

    expect(result.title).toBe('백엔드 면접 1회차');
  });

  it('getReport response includes normalized report view', async () => {
    mockPrismaService.interviewSession.findUnique.mockResolvedValue({
      sessionId: 'intv_1',
      title: '백엔드 면접 1회차',
      userId: null,
      status: 'done',
      report: {
        status: 'done',
        totalScore: 80,
        durationSec: 600,
        model: 'gpt-5-nano',
        promptVersion: 'v1',
        generatedAt: new Date('2026-02-21T00:00:00.000Z'),
        resultJson: {
          summary: '전반적으로 논리적인 답변을 제공했다.',
          strengths: ['논리성이 좋다.'],
          weaknesses: ['구체성이 부족하다.'],
          perTurnFeedback: [
            {
              turnIndex: 1,
              score: 72,
              feedback: '근거를 보강하면 더 좋다.',
              highlight: {
                strength: '구조는 좋다.',
                weakness: '수치 근거 부족',
                suggestion: '성과 수치를 덧붙여라.',
              },
            },
          ],
        },
      },
      turns: [
        {
          turnIndex: 1,
          questionType: 'base',
          questionText: '질문 1',
          answerText: '답변 1',
          submittedAt: new Date('2026-02-21T00:00:10.000Z'),
          metricsJson: { answerDuration: 22 },
        },
      ],
    });

    const result = await service.getReport('intv_1', '999999');

    expect(result.report?.view).toBeDefined();
    expect(result.report?.view?.summary.totalScore).toBe(80);
    expect(result.report?.view?.record.turns).toHaveLength(1);
  });

  it('regenerateReport switches interview status to analyzing', async () => {
    mockPrismaService.interviewSession.findUnique.mockResolvedValue({
      sessionId: 'intv_1',
      userId: null,
      status: 'done',
      turns: [{ turnIndex: 1, answerText: '답변 1' }],
    });
    mockPrismaService.interviewSession.update.mockResolvedValue({});
    mockReportService.upsertAnalyzingReport.mockResolvedValue(undefined);
    mockReportService.generateForSession.mockResolvedValue(undefined);

    const result = await service.regenerateReport('intv_1', '999999');

    expect(result.status).toBe('ANALYZING');
    expect(mockPrismaService.interviewSession.update).toHaveBeenCalledWith({
      where: { sessionId: 'intv_1' },
      data: { status: 'analyzing' },
    });
    expect(mockReportService.upsertAnalyzingReport).toHaveBeenCalledWith('intv_1');
  });

  describe('submitTurn', () => {
    const interviewId = 'intv_123';
    const userId = '999999';

    const buildSession = (followupStreak: number) => ({
      sessionId: interviewId,
      userId: null,
      status: 'in_progress' as const,
      currentTurn: 1,
      followupStreak,
      topic: JSON.stringify({ mainTopicId: 'backend', subTopicIds: ['nestjs'] }),
      turns: [
        {
          turnIndex: 1,
          questionText: '첫 질문',
          metricsJson: {},
        },
      ],
    });

    beforeEach(() => {
      mockPrismaService.interviewTurn.update.mockResolvedValue({});
      mockPrismaService.interviewSession.update.mockResolvedValue({});
      mockPrismaService.interviewTurn.upsert.mockResolvedValue({});
      mockAiService.generateInterviewQuestion.mockResolvedValue({
        questionId: 'q_next',
        text: '다음 질문',
      });
    });

    it('returns base question when followup is not requested', async () => {
      mockPrismaService.interviewSession.findUnique.mockResolvedValue(
        buildSession(1),
      );

      const result = await service.submitTurn(
        interviewId,
        {
          answerText: '답변',
          turnIndex: 1,
          answerDuration: 12,
          isFollowupQuestion: false,
        },
        userId,
      );

      expect(result.nextQuestion?.type).toBe('base');
      expect(result.consecutiveFollowupCount).toBe(0);
      expect(mockAiService.generateInterviewQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          isFollowup: false,
          answerText: undefined,
        }),
      );
    });

    it('returns followup question when requested and streak is below limit', async () => {
      mockPrismaService.interviewSession.findUnique.mockResolvedValue(
        buildSession(1),
      );

      const result = await service.submitTurn(
        interviewId,
        {
          answerText: '답변',
          turnIndex: 1,
          answerDuration: 12,
          isFollowupQuestion: true,
        },
        userId,
      );

      expect(result.nextQuestion?.type).toBe('followup');
      expect(result.consecutiveFollowupCount).toBe(2);
      expect(mockAiService.generateInterviewQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          isFollowup: true,
          answerText: '답변',
        }),
      );
    });

    it('falls back to base question when followup streak reached limit', async () => {
      mockPrismaService.interviewSession.findUnique.mockResolvedValue(
        buildSession(2),
      );

      const result = await service.submitTurn(
        interviewId,
        {
          answerText: '답변',
          turnIndex: 1,
          answerDuration: 12,
          isFollowupQuestion: true,
        },
        userId,
      );

      expect(result.nextQuestion?.type).toBe('base');
      expect(result.consecutiveFollowupCount).toBe(0);
      expect(mockAiService.generateInterviewQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          isFollowup: false,
          answerText: undefined,
        }),
      );
    });
  });
});
