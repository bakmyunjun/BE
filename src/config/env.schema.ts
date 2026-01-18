import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.string().optional(),
  KAKAO_CLIENT_ID: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  KAKAO_CALLBACK_URL: z.string().optional(),
  OAUTH_REDIRECT_URL: z.string().url().optional(),
  // OAuth 리다이렉트 허용 URL 목록 (쉼표로 구분)
  OAUTH_ALLOWED_REDIRECT_URLS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((url) => url.trim()) : [])),
  // Better Stack (Logtail) Source Token (로그 전송)
  LOGTAIL_SOURCE_TOKEN: z.string().optional(),
  ENABLE_SWAGGER: z
    .string()
    .optional()
    .transform((val) => val === 'true' || val === '1'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(
      `환경 변수 검증 실패: ${parsed.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join(', ')}`,
    );
  }

  return parsed.data;
}
