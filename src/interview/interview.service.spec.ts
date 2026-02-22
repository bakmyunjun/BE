import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { InterviewService } from './interview.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';
import { ReportService } from '../report/report.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

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

  it('getReports falls back to resultJson.totalScore when report.totalScore is null', async () => {
    mockPrismaService.$transaction.mockResolvedValueOnce([
      1,
      [
        {
          sessionId: 'intv_1',
          title: '백엔드 면접 1회차',
          status: 'done',
          createdAt: new Date('2026-02-22T12:00:00.000Z'),
          report: {
            status: 'done',
            totalScore: null,
            generatedAt: new Date('2026-02-22T12:30:00.000Z'),
            resultJson: { totalScore: '82.5' },
          },
        },
      ],
    ]);

    const query = new PaginationQueryDto();
    query.page = 1;
    query.size = 10;

    const result = await service.getReports('999999', query);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].totalScore).toBe(82.5);
    expect(result.items[0].reportStatus).toBe('done');
  });

  it('getInterviewRecords returns home record payload shape', async () => {
    mockPrismaService.interviewSession.findMany.mockResolvedValueOnce([
      {
        sessionId: 'intv_1',
        createdAt: new Date('2026-02-22T12:00:00.000Z'),
        startedAt: new Date('2026-02-22T11:40:00.000Z'),
        endedAt: new Date('2026-02-22T12:01:05.000Z'),
        turns: [
          { answerText: '답변 1' },
          { answerText: '답변 2' },
          { answerText: '   ' },
        ],
        report: {
          reportId: BigInt(1),
          totalScore: null,
          durationSec: null,
          generatedAt: new Date('2026-02-22T12:05:00.000Z'),
          resultJson: {
            totalScore: '72',
            strengths: ['STAR 기법'],
            weaknesses: ['목소리 변조', '어휘 다양성'],
            competencies: {
              items: [
                { key: 'LOGIC', score: 75 },
                { key: 'SPECIFICITY', score: 65 },
                { key: 'EYE_CONTACT', score: 62 },
                { key: 'VOICE_TONE', score: 70 },
                { key: 'STAR_METHOD', score: 76 },
                { key: 'TIME_MANAGEMENT', score: 84 },
              ],
            },
          },
        },
      },
    ]);

    const result = await service.getInterviewRecords('999999');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 1,
      score: 72,
      date: '2026-02-22',
      duration: '21분 05초',
      questionProgress: '2/10 질문 완료',
      strengths: ['STAR 기법'],
      improvements: ['목소리 변조', '어휘 다양성'],
      metrics: {
        logic: 75,
        clarity: 65,
        eyeContact: 62,
        voice: 70,
        star: 76,
        time: 84,
      },
    });
  });

  it('getInterviewScoreTrend returns MM/DD score points', async () => {
    mockPrismaService.interviewSession.findMany.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-02-20T10:00:00.000Z'),
        report: {
          totalScore: null,
          generatedAt: new Date('2026-02-20T10:10:00.000Z'),
          resultJson: { totalScore: '68' },
        },
      },
      {
        createdAt: new Date('2026-02-21T10:00:00.000Z'),
        report: {
          totalScore: 81,
          generatedAt: new Date('2026-02-21T10:12:00.000Z'),
          resultJson: {},
        },
      },
    ]);

    const result = await service.getInterviewScoreTrend('999999');

    expect(result).toEqual([
      { date: '02/20', score: 68 },
      { date: '02/21', score: 81 },
    ]);
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
