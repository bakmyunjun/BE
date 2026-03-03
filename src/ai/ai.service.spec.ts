import { AiService } from './ai.service';

describe('AiService', () => {
  const createService = () => {
    const configService = {
      get: jest.fn(),
    };
    return new AiService(configService as never);
  };

  it('retries when the generated question contains disallowed phrasing', async () => {
    const service = createService();
    const generateTextSpy = jest
      .spyOn(service as never, 'generateText')
      .mockResolvedValueOnce('다음 코드를 보고 실행 결과를 설명해 주세요?')
      .mockResolvedValueOnce(
        '자바스크립트의 클로저가 외부 변수를 유지하는 원리는 무엇인가요?',
      );

    const result = await service.generateInterviewQuestion({
      mainTopicId: 'javascript',
      subTopicIds: ['javascript'],
      turnIndex: 1,
      previousQuestions: [],
    });

    expect(generateTextSpy).toHaveBeenCalledTimes(2);
    expect(result.text).toBe(
      '자바스크립트의 클로저가 외부 변수를 유지하는 원리는 무엇인가요?',
    );
  });

  it('falls back when generated questions keep violating selected topic', async () => {
    const service = createService();
    const generateTextSpy = jest
      .spyOn(service as never, 'generateText')
      .mockResolvedValue(
        '리액트에서 useEffect 의존성 배열을 설정하는 기준은 무엇인가요?',
      );

    const result = await service.generateInterviewQuestion({
      mainTopicId: 'javascript',
      subTopicIds: ['javascript'],
      turnIndex: 2,
      previousQuestions: ['자바스크립트의 이벤트 루프는 무엇인가요?'],
    });

    expect(generateTextSpy).toHaveBeenCalledTimes(3);
    expect(result.text).toBe(
      'javascript의 핵심 개념과 동작 원리는 무엇인가요?',
    );
  });
});
