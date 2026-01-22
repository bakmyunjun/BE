import { Test, TestingModule } from '@nestjs/testing';
import { InterviewService } from './interview.service';
import { AiService } from '../ai/ai.service';

describe('InterviewService', () => {
  let service: InterviewService;

  const mockAiService = {
    generateInterviewQuestion: jest.fn(),
    evaluateAnswer: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewService,
        {
          provide: AiService,
          useValue: mockAiService,
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
