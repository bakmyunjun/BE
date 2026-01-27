import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { Env } from '../config/env.schema';
import { AiService } from '../ai/ai.service';

type ReportResult = {
  totalScore?: number;
  summary?: string;
  strengths?: string[];
  weaknesses?: string[];
  perTurnFeedback?: Array<{
    turnIndex: number;
    score?: number;
    feedback: string;
  }>;
  rawText?: string;
};

@Injectable()
export class ReportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<Env, true>,
    private readonly aiService: AiService,
  ) { }

  onModuleInit() {
    const enabled =
      this.configService.get('ENABLE_REPORT_WORKER', { infer: true }) ?? false;
    if (!enabled) return;

    const intervalMs =
      this.configService.get('REPORT_WORKER_INTERVAL_MS', { infer: true }) ??
      5000;

    this.logger.log(`Report worker enabled (interval=${intervalMs}ms)`);
    this.timer = setInterval(() => {
      void this.processNext().catch((err) => {
        this.logger.error('Report worker tick failed', err);
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async upsertAnalyzingReport(sessionId: string) {
    const existing = await this.prisma.interviewReport.findUnique({
      where: { sessionId },
      select: { status: true },
    });

    if (!existing) {
      await this.prisma.interviewReport.create({
        data: { sessionId, status: 'analyzing' },
      });
      return;
    }

    if (existing.status !== 'done') {
      await this.prisma.interviewReport.update({
        where: { sessionId },
        data: {
          status: 'analyzing',
          generatedAt: null,
          resultJson: Prisma.DbNull,
        },
      });
    }
  }

  private async processNext() {
    const report = await this.prisma.interviewReport.findFirst({
      where: {
        status: 'analyzing',
        generatedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      select: { reportId: true, sessionId: true },
    });
    if (!report) return;

    await this.generateForSession(report.sessionId);
  }

  async generateForSession(sessionId: string) {
    const existing = await this.prisma.interviewReport.findUnique({
      where: { sessionId },
      select: { status: true, generatedAt: true },
    });
    if (existing?.status === 'done' && existing.generatedAt) return;

    const session = await this.prisma.interviewSession.findUnique({
      where: { sessionId },
      include: {
        turns: {
          orderBy: { turnIndex: 'asc' },
          select: {
            turnIndex: true,
            questionType: true,
            questionText: true,
            answerText: true,
            metricsJson: true,
          },
        },
      },
    });
    if (!session) return;

    const durationSec =
      session.endedAt && session.startedAt
        ? Math.max(
          0,
          Math.floor(
            (session.endedAt.getTime() - session.startedAt.getTime()) / 1000,
          ),
        )
        : undefined;

    try {
      const prompt = this.buildReportPrompt(session);
      const rawText = await this.aiService.generateInterviewReport({ prompt });
      const parsed = this.parseReportJson(rawText);
      const resultJson = parsed
        ? ({ ...parsed, _rawText: rawText } as Prisma.InputJsonObject)
        : ({ _rawText: rawText } as Prisma.InputJsonObject);
      const totalScore =
        parsed && typeof (parsed as Record<string, unknown>).totalScore === 'number'
          ? ((parsed as Record<string, unknown>).totalScore as number)
          : undefined;

      await this.prisma.interviewReport.upsert({
        where: { sessionId },
        create: {
          sessionId,
          status: 'done',
          resultJson,
          totalScore,
          durationSec,
          model: 'solar-pro',
          promptVersion: 'v1',
          generatedAt: new Date(),
        },
        update: {
          status: 'done',
          resultJson,
          totalScore,
          durationSec,
          model: 'solar-pro',
          promptVersion: 'v1',
          generatedAt: new Date(),
        },
      });

      await this.prisma.interviewSession.update({
        where: { sessionId },
        data: { status: 'done' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failure: Prisma.InputJsonValue = {
        error: message,
      } as Prisma.InputJsonObject;

      await this.prisma.interviewReport.upsert({
        where: { sessionId },
        create: {
          sessionId,
          status: 'failed',
          resultJson: failure,
          durationSec,
          model: 'solar-pro',
          promptVersion: 'v1',
          generatedAt: new Date(),
        },
        update: {
          status: 'failed',
          resultJson: failure,
          durationSec,
          model: 'solar-pro',
          promptVersion: 'v1',
          generatedAt: new Date(),
        },
      });

      await this.prisma.interviewSession.update({
        where: { sessionId },
        data: { status: 'failed' },
      });
    }
  }

  private buildReportPrompt(session: {
    sessionId: string;
    title: string | null;
    topic: string | null;
    turns: Array<{
      turnIndex: number;
      questionType: string;
      questionText: string;
      answerText: string;
      metricsJson: Prisma.JsonValue | null;
    }>;
  }) {
    const turns = session.turns
      .filter((t) => (t.answerText ?? "").trim().length > 0)
      .map((t) => ({
        turnIndex: t.turnIndex,
        questionType: t.questionType,
        questionText: t.questionText,
        answerText: t.answerText,
        metrics: t.metricsJson,
      }));

    return [
      // 역할
      "당신은 숙련된 기술 면접 평가관이다.",
      "목표는 면접 기록을 바탕으로 프론트에서 즉시 렌더 가능한 평가 리포트를 생성하는 것이다.",
      "",

      // 출력 규칙 (JSON-only 강제 + 코드펜스/영어 방지)
      "출력 규칙:",
      "- 반드시 JSON 단일 객체만 출력한다.",
      "- 출력의 첫 글자는 반드시 { 이어야 한다.",
      "- 출력의 마지막 글자는 반드시 } 이어야 한다.",
      "- 설명/마크다운/코드펜스/주석/추가 텍스트를 절대 출력하지 않는다.",
      "- 출력에 백틱(`) 또는 코드펜스(```) 문자를 절대 포함하지 않는다.",
      "- 출력에 'json' 문자열을 절대 포함하지 않는다.",
      "- JSON을 문자열로 감싸지 않는다(예: \"{\\\"a\\\":1}\" 금지).",
      "- 모든 문자열은 한국어로 작성하고, 종결은 '-다/-이다'로 작성한다(영어 금지).",
      "- 숫자는 숫자 타입으로 출력한다(문자열 금지).",
      "- 스키마에 없는 키를 추가하지 않는다.",
      "- 알 수 없거나 제공되지 않은 값은 null로 출력한다.",
      "- 위 규칙을 지킬 수 없으면 빈 JSON 객체 {} 만 출력한다.",
      "",

      // metrics 규칙 (환각 방지)
      "metrics 사용 규칙:",
      "- metrics는 turn별 부가 지표이며, 존재할 때만 참고한다.",
      "- metrics의 키/단위가 불명확하면 추측하지 말고 null 처리한다.",
      "- metrics가 없더라도 텍스트(answerText) 기반으로 평가는 반드시 수행한다.",
      "",

      // 고정 enum (너가 고정하려는 key 포함)
      "고정 Enum(절대 변경 금지):",
      '- competencyKey: ["LOGIC","TIME_MANAGEMENT","SPECIFICITY","STAR_METHOD","EYE_CONTACT","VOICE_TONE"]',
      '- competencyLevel: ["우수","양호","보통","개선 필요"]',
      '- severity: ["INFO","WARNING","CRITICAL"]',
      "",

      // 평가 기준
      "평가 기준(총점 0~100):",
      "- LOGIC 25점: 구조(주장-근거-예시, 원인-해결-결과)가 명확한가.",
      "- SPECIFICITY 20점: 수치/기간/비교/범위 등 구체 정보가 있는가.",
      "- COMMUNICATION 20점: 핵심 전달, 용어 설명, 듣는 사람 관점의 설명이 있는가.",
      "- PROBLEM_SOLVING 20점: 대안/트레이드오프/검증/회고가 포함되는가.",
      "- TIME_MANAGEMENT 15점: 너무 장황하거나 지나치게 짧지 않은가.",
      "",

      // 스키마 고정 (렌더 친화)
      "JSON 스키마(반드시 이 구조로만 출력):",
      "{",
      '  "version": "v1",',
      '  "session": { "sessionId": string, "title": string | null, "topic": string | null },',
      '  "totalScore": number,',
      '  "summary": string,',
      '  "strengths": string[],',
      '  "weaknesses": string[],',
      '  "competencies": {',
      '    "items": [',
      '      { "key": "LOGIC", "label": "논리성", "level": string, "score": number, "comment": string },',
      '      { "key": "TIME_MANAGEMENT", "label": "시간 관리", "level": string, "score": number, "comment": string },',
      '      { "key": "SPECIFICITY", "label": "구체성", "level": string, "score": number, "comment": string },',
      '      { "key": "STAR_METHOD", "label": "STAR 기법", "level": string, "score": number, "comment": string },',
      '      { "key": "EYE_CONTACT", "label": "시선 처리", "level": string, "score": number, "comment": string },',
      '      { "key": "VOICE_TONE", "label": "목소리 톤", "level": string, "score": number, "comment": string }',
      "    ]",
      "  },",
      '  "textPatternAnalysis": {',
      '    "issues": [ { "type": string, "severity": string, "description": string, "affectedTurnIndexes": number[] } ]',
      "  },",
      '  "perTurnFeedback": [',
      '    {',
      '      "turnIndex": number,',
      '      "score": number,',
      '      "feedback": string,',
      '      "highlight": { "strength": string | null, "weakness": string | null, "suggestion": string | null }',
      "    }",
      "  ]",
      "}",
      "",

      // 생성 규칙 (안정화)
      "생성 규칙:",
      "- perTurnFeedback 길이는 입력 turns 길이와 정확히 같아야 한다.",
      "- strengths/weaknesses는 중복을 피하고 2~5개로 제한한다.",
      "- textPatternAnalysis.issues는 최대 5개까지만 출력한다.",
      "- summary는 2~4문장으로 작성한다.",
      "- competencies.items의 score 합계가 totalScore와 유사한 경향을 가져야 한다(완전 일치 필수는 아니다).",
      "",

      // 입력
      "입력:",
      `sessionId: ${session.sessionId}`,
      `title: ${session.title ?? "null"}`,
      `topic: ${session.topic ?? "null"}`,
      "turns(JSON):",
      JSON.stringify(turns),
    ].join("\n");
  }

  private parseReportJson(raw: string): Prisma.InputJsonObject | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const parseOnce = (text: string): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    };

    // 1) code fence 제거 (```json ... ```)
    const fencedMatch = trimmed.match(/```(?:json)?\\s*([\\s\\S]*?)\\s*```/i);
    const candidate1 = fencedMatch?.[1]?.trim() || trimmed;

    // 2) 1차 파싱
    const parsed1 = parseOnce(candidate1);
    if (parsed1 && typeof parsed1 === 'object' && !Array.isArray(parsed1)) {
      return parsed1 as Prisma.InputJsonObject;
    }

    // 3) JSON이 문자열로 한 번 더 감싸진 경우
    if (typeof parsed1 === 'string') {
      const parsed2 = parseOnce(parsed1);
      if (parsed2 && typeof parsed2 === 'object' && !Array.isArray(parsed2)) {
        return parsed2 as Prisma.InputJsonObject;
      }
    }

    // 4) 잡텍스트 제거: 첫 { ~ 마지막 } 구간 추출
    const firstBrace = candidate1.indexOf('{');
    const lastBrace = candidate1.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const slice = candidate1.slice(firstBrace, lastBrace + 1);
      const parsed3 = parseOnce(slice);
      if (parsed3 && typeof parsed3 === 'object' && !Array.isArray(parsed3)) {
        return parsed3 as Prisma.InputJsonObject;
      }
    }

    return null;
  }
}
