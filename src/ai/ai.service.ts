import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { Env } from '../config/env.schema';

export interface GenerateQuestionParams {
  mainTopicId: string;
  subTopicIds: string[];
  turnIndex: number;
  previousQuestions?: string[];
  answerText?: string; // 꼬리질문 생성 시 답변 내용
  isFollowup?: boolean; // 꼬리질문 여부
}

export interface GeneratedQuestion {
  questionId: string;
  text: string;
}

export interface GenerateReportParams {
  prompt: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client?: OpenAI;
  private cachedModel?: string;

  constructor(private readonly configService: ConfigService<Env>) {
    // NOTE: client는 필요 시점에만 초기화 (development에서 키 없이도 서버 부팅 가능)
  }

  private getClient(): OpenAI {
    if (this.client) return this.client;

    const provider = this.getProvider();
    const apiKey =
      provider === 'openai'
        ? this.configService.get('OPENAI_API_KEY')
        : this.configService.get('UPSTAGE_API_KEY');

    if (!apiKey) {
      throw new Error(
        provider === 'openai'
          ? 'OPENAI_API_KEY is not set'
          : 'UPSTAGE_API_KEY is not set',
      );
    }

    const baseURL =
      this.configService.get('OPENAI_BASE_URL') ??
      (provider === 'upstage' ? 'https://api.upstage.ai/v1/solar' : undefined);

    this.client = new OpenAI({ apiKey, baseURL });
    this.cachedModel = this.resolveModel(provider);

    return this.client;
  }

  getConfiguredModel(): string {
    if (this.cachedModel) return this.cachedModel;
    const provider = this.getProvider();
    const model = this.resolveModel(provider);
    this.cachedModel = model;
    return model;
  }

  private getProvider(): 'openai' | 'upstage' {
    const configuredProvider = this.configService.get('AI_PROVIDER');
    if (configuredProvider === 'openai' || configuredProvider === 'upstage') {
      return configuredProvider;
    }
    if (this.configService.get('OPENAI_API_KEY')) return 'openai';
    return 'upstage';
  }

  private resolveModel(provider: 'openai' | 'upstage'): string {
    const configuredModel = this.configService.get('AI_MODEL');
    if (configuredModel) return configuredModel;
    return provider === 'openai' ? 'gpt-5-nano' : 'solar-pro';
  }

  private extractResponseText(response: {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string | { value?: string } }>;
    }>;
  }): string {
    const outputText = response.output_text?.trim();
    if (outputText) return outputText;

    const segments =
      response.output
        ?.flatMap((item) =>
          (item.content ?? [])
            .map((c) => {
              if (c.type !== 'output_text' && c.type !== 'text') return '';
              if (typeof c.text === 'string') return c.text;
              if (c.text && typeof c.text === 'object') return c.text.value ?? '';
              return '';
            })
            .filter((text) => text.trim().length > 0),
        )
        .filter((t) => t.trim().length > 0) ?? [];
    return segments.join('\n').trim();
  }

  private async generateText(params: {
    systemPrompt: string;
    userPrompt: string;
    tokenLimit: number;
    temperature?: number;
  }): Promise<string> {
    const { systemPrompt, userPrompt, tokenLimit, temperature } = params;
    const provider = this.getProvider();
    const model = this.getConfiguredModel();

    if (provider === 'openai') {
      const response = await this.getClient().responses.create({
        model,
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: tokenLimit,
      });

      const text = this.extractResponseText(response);
      if (text) return text;

      // responses API에서 빈 텍스트가 돌아오는 경우 chat.completions로 1회 폴백
      this.logger.warn(
        `OpenAI responses API returned empty text. fallback to chat.completions (model=${model})`,
      );

      const fallback = await this.getClient().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: tokenLimit,
      });
      return fallback.choices[0]?.message?.content?.trim() || '';
    }

    const response = await this.getClient().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: tokenLimit,
    });

    return response.choices[0]?.message?.content?.trim() || '';
  }

  async generateInterviewReport(params: GenerateReportParams): Promise<string> {
    const { prompt } = params;
    const text = await this.generateText({
      systemPrompt: 'You are a strict JSON generator. Output JSON only. No markdown.',
      userPrompt: prompt,
      tokenLimit: 1500,
      temperature: 0.2,
    });

    if (!text) {
      throw new Error('AI report response was empty');
    }

    return text;
  }

  /**
   * Solar Pro를 사용하여 면접 질문을 생성합니다.
   */
  async generateInterviewQuestion(
    params: GenerateQuestionParams,
  ): Promise<GeneratedQuestion> {
    const {
      mainTopicId,
      subTopicIds,
      turnIndex,
      previousQuestions = [],
      answerText,
      isFollowup,
    } = params;

    try {
      const prompt = this.buildQuestionPrompt({
        mainTopicId,
        subTopicIds,
        turnIndex,
        previousQuestions,
        answerText,
        isFollowup,
      });

      const questionType = isFollowup ? '꼬리질문' : '일반질문';
      this.logger.log(
        `질문 생성 요청: 주제=${mainTopicId}, 서브토픽=${subTopicIds.join(', ')}, 턴=${turnIndex}, 타입=${questionType}`,
      );

      const responseText = await this.generateText({
        systemPrompt: this.getSystemPrompt(),
        userPrompt: prompt,
        tokenLimit: 500,
        temperature: 0.7,
      });

      if (!responseText) {
        throw new Error('AI question response was empty');
      }

      let questionText = responseText;

      // 여러 질문이 생성된 경우 첫 번째 질문만 추출
      // 줄바꿈으로 구분된 경우 첫 번째 질문만 사용
      if (questionText.includes('\n\n')) {
        // 이중 줄바꿈으로 구분된 경우 첫 번째 부분만 사용
        const parts = questionText.split('\n\n');
        questionText = parts[0].trim();
      } else if (questionText.split('\n').length > 2) {
        // 여러 줄인 경우 첫 번째 질문만 추출
        const lines = questionText
          .split('\n')
          .filter((line) => line.trim().length > 0);
        // 번호가 있는 경우 (예: "1. 질문내용") 첫 번째 줄 사용
        // 번호가 없는 경우 첫 번째 물음표가 있는 줄 사용
        const firstQuestionLine =
          lines.find((line) => line.includes('?') || line.match(/^\d+\./)) ||
          lines[0];

        if (firstQuestionLine) {
          // 번호 제거 (예: "1. " 제거)
          questionText = firstQuestionLine.replace(/^\d+\.\s*/, '').trim();

          // 첫 번째 물음표까지만 추출 (여러 질문이 한 줄에 있는 경우)
          const questionEndIndex = questionText.indexOf('?');
          if (questionEndIndex !== -1) {
            questionText = questionText
              .substring(0, questionEndIndex + 1)
              .trim();
          }
        }
      } else {
        // 한 줄이지만 여러 질문이 있는 경우 첫 번째 물음표까지만
        const questionEndIndex = questionText.indexOf('?');
        if (
          questionEndIndex !== -1 &&
          questionText.substring(questionEndIndex + 1).includes('?')
        ) {
          // 여러 물음표가 있는 경우 첫 번째 질문만
          questionText = questionText.substring(0, questionEndIndex + 1).trim();
        }
      }

      const questionId = `q_${Date.now()}_${turnIndex}`;

      this.logger.log(`질문 생성 완료: ${questionId}`);

      return {
        questionId,
        text: questionText,
      };
    } catch (error) {
      this.logger.error('질문 생성 중 오류 발생', error);
      // 원본 에러 정보를 보존하여 재발생
      throw error;
    }
  }

  /**
   * 시스템 프롬프트: 면접관 역할 정의
   */
  private getSystemPrompt(): string {
    return `당신은 경험이 풍부한 기술 면접관입니다. 
지원자의 기술 역량을 평가하기 위한 면접 질문을 생성합니다.

질문 생성 원칙:
1. 지원자의 실제 이해도를 평가할 수 있는 질문을 만드세요
2. 단순 암기가 아닌 개념 이해와 응용력을 확인하세요
3. 실무 경험과 연결될 수 있는 질문을 우선하세요
4. 난이도는 점진적으로 높아지도록 조절하세요
5. 질문은 명확하고 구체적이어야 합니다
6. 이전 질문과 중복되지 않도록 하세요

중요: 응답 형식
- 반드시 하나의 질문만 생성하세요 (여러 질문을 나열하지 마세요)
- 질문만 출력하세요 (설명, 부가 정보, 번호 매기기 없이)
- 한 문장으로 간결하게 작성하세요
- 예시: "React의 Virtual DOM이 무엇인지 설명해주세요." (이런 형식으로 하나만)`;
  }

  /**
   * 사용자 프롬프트: 구체적인 질문 생성 요청
   */
  private buildQuestionPrompt(params: {
    mainTopicId: string;
    subTopicIds: string[];
    turnIndex: number;
    previousQuestions: string[];
    answerText?: string;
    isFollowup?: boolean;
  }): string {
    const {
      mainTopicId,
      subTopicIds,
      turnIndex,
      previousQuestions,
      answerText,
      isFollowup,
    } = params;

    let prompt = `면접 주제: ${mainTopicId}\n`;

    if (subTopicIds.length > 0) {
      prompt += `세부 주제: ${subTopicIds.join(', ')}\n`;
    }

    prompt += `현재 턴: ${turnIndex}\n`;

    // 꼬리질문인 경우 답변 기반으로 질문 생성
    if (isFollowup && answerText) {
      prompt += `\n이전 질문에 대한 지원자의 답변:\n${answerText}\n\n`;
      prompt += '위 답변을 바탕으로 하나의 꼬리질문만 생성해주세요.\n';
      prompt += '- 답변의 깊이를 더 파고들 수 있는 질문을 만드세요\n';
      prompt +=
        '- 답변에서 언급된 내용을 더 자세히 물어보거나, 관련된 심화 내용을 질문하세요\n';
      prompt +=
        '- 답변의 부족한 부분이나 보완이 필요한 부분을 지적하는 질문도 좋습니다\n';
      prompt +=
        '\n중요: 반드시 하나의 질문만 생성하세요. 여러 질문을 나열하지 마세요.\n';
    } else {
      // 일반 질문 생성
      if (previousQuestions.length > 0) {
        prompt += '\n이전 질문들:\n';
        previousQuestions.forEach((q, i) => {
          prompt += `${i + 1}. ${q}\n`;
        });
        prompt += '\n위 질문들과 중복되지 않는 새로운 질문을 생성해주세요.\n';
      }

      if (turnIndex === 1) {
        prompt += '\n첫 번째 질문이므로 기본적인 개념부터 시작하세요.';
      } else if (turnIndex <= 3) {
        prompt += '\n초반 질문이므로 중간 난이도의 질문을 생성하세요.';
      } else {
        prompt += '\n심화 질문을 생성하여 깊이 있는 이해도를 평가하세요.';
      }

      prompt +=
        '\n중요: 반드시 하나의 질문만 생성하세요. 여러 질문을 나열하지 마세요.';
    }

    return prompt;
  }

  /**
   * 답변 평가 (추후 구현용)
   */
  async evaluateAnswer(params: {
    question: string;
    answer: string;
  }): Promise<{
    score: number;
    feedback: string;
  }> {
    // TODO: 답변 평가 로직 구현
    return {
      score: 0,
      feedback: '평가 기능은 아직 구현되지 않았습니다.',
    };
  }
}
