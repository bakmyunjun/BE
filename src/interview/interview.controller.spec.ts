import { Test, TestingModule } from '@nestjs/testing';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { AiService } from '../ai/ai.service';

describe('InterviewController', () => {
  let controller: InterviewController;

  const mockAiService = {
    generateInterviewQuestion: jest.fn(),
    evaluateAnswer: jest.fn(),
  };

  const mockInterviewService = {
    createAndStart: jest.fn(),
    submitTurn: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InterviewController],
      providers: [
        {
          provide: InterviewService,
          useValue: mockInterviewService,
        },
        {
          provide: AiService,
          useValue: mockAiService,
        },
      ],
    }).compile();

    controller = module.get<InterviewController>(InterviewController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
