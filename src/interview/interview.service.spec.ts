import { Test, TestingModule } from '@nestjs/testing';
import { InterviewService } from './interview.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../database/prisma.service';

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
      update: jest.fn(),
    },
    interviewTurn: {
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
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
});
