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
  private static readonly MAX_QUESTION_LENGTH = 80;

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
        reasoning: { effort: 'minimal' },
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

  private normalizeQuestionText(raw: string): string {
    let text = raw.replace(/\s+/g, ' ').trim();
    text = text.replace(/^(질문|면접 질문)\s*[:：]\s*/i, '');

    const firstQuestionMark = text.indexOf('?');
    if (firstQuestionMark !== -1) {
      const secondQuestionMark = text.indexOf('?', firstQuestionMark + 1);
      if (secondQuestionMark !== -1) {
        text = text.slice(0, firstQuestionMark + 1).trim();
      }
    }

    if (text.length > AiService.MAX_QUESTION_LENGTH) {
      text = text.slice(0, AiService.MAX_QUESTION_LENGTH).trim();
    }

    if (text.length > 0 && !text.endsWith('?')) {
      text = `${text}?`;
    }

    return text;
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
        tokenLimit: 120,
        temperature: 0.3,
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

      questionText = this.normalizeQuestionText(questionText);

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
    return `당신은 기술 면접관입니다.
질문 생성 규칙:
1) 한국어 존댓말로 질문 1개만 작성
2) 반드시 한 문장
3) 80자 이하
4) 설명, 예시, 배경, 번호, 코드블록 금지
5) 물음표(?)는 최대 1개

출력은 질문 문장만 작성하세요.`;
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

    let prompt = `주제: ${mainTopicId}\n`;

    if (subTopicIds.length > 0) {
      prompt += `세부 주제: ${subTopicIds.join(', ')}\n`;
    }

    prompt += `턴: ${turnIndex}\n`;

    if (isFollowup && answerText?.trim()) {
      prompt += '모드: 꼬리질문\n';
      prompt += `기준 답변: ${answerText.trim()}\n`;
      prompt += '요청: 답변의 핵심 개념 1개를 더 깊게 묻는 질문 1개 생성\n';
    } else {
      prompt += '모드: 일반질문\n';
      prompt += '요청: 중복되지 않는 질문 1개 생성\n';

      if (previousQuestions.length > 0) {
        prompt += '이전 질문:\n';
        previousQuestions.slice(-5).forEach((q, i) => {
          prompt += `${i + 1}. ${q}\n`;
        });
      }

      if (turnIndex === 1) {
        prompt += '난이도: 기본\n';
      } else if (turnIndex <= 3) {
        prompt += '난이도: 중간\n';
      } else {
        prompt += '난이도: 심화\n';
      }
    }

    prompt += '출력 형식: 질문 한 문장만 출력\n';
    prompt += '제한: 80자 이하\n';

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
