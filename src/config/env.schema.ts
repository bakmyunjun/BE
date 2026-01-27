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
  // Sentry DSN (에러 로깅) - 빈 문자열 또는 유효한 URL
  SENTRY_DSN: z
    .string()
    .optional()
    .refine((val) => !val || val.startsWith('https://'), {
      message: 'SENTRY_DSN must be a valid URL or empty',
    }),
  // 프로덕션 CORS 허용 Origin 목록 (쉼표로 구분)
  FRONTEND_URL: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((url) => url.trim()) : [])),
  ENABLE_SWAGGER: z
    .string()
    .optional()
    .transform((val) =>
      val === undefined ? undefined : val === 'true' || val === '1',
    ),
  // Swagger Basic Auth (production에서 Swagger를 켤 때 필수 권장)
  SWAGGER_BASIC_USER: z.string().optional(),
  SWAGGER_BASIC_PASSWORD: z.string().optional(),
  // Upstage Solar API Key
  UPSTAGE_API_KEY: z
    .string()
    .optional()
    .transform((val) => (val ? val.trim() : undefined)),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === 'production' && !env.UPSTAGE_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['UPSTAGE_API_KEY'],
      message: 'UPSTAGE_API_KEY is required in production',
    });
  }

  if (env.NODE_ENV === 'production' && env.ENABLE_SWAGGER === true) {
    if (!env.SWAGGER_BASIC_USER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SWAGGER_BASIC_USER'],
        message: 'SWAGGER_BASIC_USER is required when ENABLE_SWAGGER is true in production',
      });
    }
    if (!env.SWAGGER_BASIC_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SWAGGER_BASIC_PASSWORD'],
        message:
          'SWAGGER_BASIC_PASSWORD is required when ENABLE_SWAGGER is true in production',
      });
    }
  }
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
