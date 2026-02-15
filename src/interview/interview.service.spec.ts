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
