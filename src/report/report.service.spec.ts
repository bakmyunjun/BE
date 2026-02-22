import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportService } from './report.service';
import { PrismaService } from '../database/prisma.service';
import { AiService } from '../ai/ai.service';

describe('ReportService', () => {
  let service: ReportService;

  const mockPrismaService = {
    interviewReport: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockAiService = {
    getConfiguredModel: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: AiService,
          useValue: mockAiService,
        },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws on invalid report id', async () => {
    await expect(service.getReportSummary(0, '999999')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when report is missing', async () => {
    mockPrismaService.interviewReport.findUnique.mockResolvedValueOnce(null);

    await expect(service.getReportSummary(999, '999999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('maps summary payload with top3 strengths and improvements', async () => {
    mockPrismaService.interviewReport.findUnique.mockResolvedValueOnce({
      resultJson: {
        strengths: ['강점1', '강점2', '강점3', '강점4'],
        weaknesses: ['개선1', '개선2', '개선3', '개선4'],
        competencies: {
          items: [
            { key: 'LOGIC', score: 78 },
            { key: 'SPECIFICITY', score: 72 },
            { key: 'VOICE_TONE', score: 74 },
            { key: 'EYE_CONTACT', score: 68 },
            { key: 'STAR_METHOD', score: 80 },
          ],
        },
      },
      session: {
        userId: BigInt(999999),
      },
    });

    const result = await service.getReportSummary(1, '999999');

    expect(result).toEqual({
      skills: {
        logic: 78,
        specificity: 72,
        delivery: 74,
        eyeContact: 68,
        voice: 74,
        structure: 80,
      },
      strengths: ['강점1', '강점2', '강점3'],
      improvements: ['개선1', '개선2', '개선3'],
    });
  });

  it('maps turn metrics payload', async () => {
    mockPrismaService.interviewReport.findUnique.mockResolvedValueOnce({
      session: {
        userId: BigInt(999999),
        turns: [
          {
            turnIndex: 1,
            metricsJson: {
              answerDuration: 18.3,
              faceMetrics: { eyeOffPercent: 12 },
              voiceMetrics: {
                timeDistribution: { pause: 8, speaking: 92 },
              },
            },
          },
          {
            turnIndex: 2,
            metricsJson: {
              answerDuration: 22.1,
              faceMetrics: {
                expressionDistribution: { away: 0.08 },
              },
              voiceMetrics: {
                silenceRatio: 0.05,
              },
            },
          },
        ],
      },
    });

    const result = await service.getTurnMetrics(1, '999999');

    expect(result).toEqual([
      { question: 'Q1', time: 18, eyeOff: 12, silence: 8 },
      { question: 'Q2', time: 22, eyeOff: 8, silence: 5 },
    ]);
  });
});
