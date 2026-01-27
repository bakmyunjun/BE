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
  ) {}

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
      const parsed = this.tryParseJson(rawText);

      const resultJson = this.toJsonResultJson(parsed, rawText);
      const totalScore =
        typeof resultJson.totalScore === 'number'
          ? resultJson.totalScore
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
      .filter((t) => t.answerText?.trim().length > 0)
      .map((t) => ({
        turnIndex: t.turnIndex,
        questionType: t.questionType,
        questionText: t.questionText,
        answerText: t.answerText,
        metrics: t.metricsJson,
      }));

    return [
      '당신은 숙련된 기술 면접 평가관입니다.',
      '',
      '아래 면접 기록을 바탕으로 평가 리포트를 생성하세요.',
      '반드시 JSON만 출력하세요(설명/마크다운/코드펜스 금지).',
      '',
      'JSON 스키마:',
      '{',
      '  "totalScore": number,          // 0~100',
      '  "summary": string,',
      '  "strengths": string[],',
      '  "weaknesses": string[],',
      '  "perTurnFeedback": [',
      '    { "turnIndex": number, "score": number, "feedback": string }',
      '  ]',
      '}',
      '',
      `sessionId: ${session.sessionId}`,
      `title: ${session.title ?? ''}`,
      `topic: ${session.topic ?? ''}`,
      '',
      'turns:',
      JSON.stringify(turns),
    ].join('\n');
  }

  private tryParseJson(raw: string): ReportResult | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ReportResult;
    } catch {
      return null;
    }
  }

  private toJsonResultJson(
    parsed: ReportResult | null,
    rawText: string,
  ): Prisma.InputJsonObject {
    const result: Record<string, unknown> = { rawText };
    if (!parsed) return result as Prisma.InputJsonObject;

    const totalScore =
      typeof parsed.totalScore === 'number' ? parsed.totalScore : undefined;
    if (totalScore !== undefined) result.totalScore = totalScore;

    if (typeof parsed.summary === 'string') result.summary = parsed.summary;

    if (Array.isArray(parsed.strengths)) {
      const strengths = parsed.strengths.filter((v) => typeof v === 'string');
      if (strengths.length) result.strengths = strengths;
    }

    if (Array.isArray(parsed.weaknesses)) {
      const weaknesses = parsed.weaknesses.filter((v) => typeof v === 'string');
      if (weaknesses.length) result.weaknesses = weaknesses;
    }

    if (Array.isArray(parsed.perTurnFeedback)) {
      const perTurnFeedback = parsed.perTurnFeedback
        .filter(
          (v) =>
            v &&
            typeof v === 'object' &&
            typeof (v as { turnIndex?: unknown }).turnIndex === 'number' &&
            typeof (v as { feedback?: unknown }).feedback === 'string',
        )
        .map((v) => ({
          turnIndex: (v as { turnIndex: number }).turnIndex,
          ...(typeof (v as { score?: unknown }).score === 'number'
            ? { score: (v as { score: number }).score }
            : {}),
          feedback: (v as { feedback: string }).feedback,
        }));
      if (perTurnFeedback.length) result.perTurnFeedback = perTurnFeedback;
    }

    return result as Prisma.InputJsonObject;
  }
}
