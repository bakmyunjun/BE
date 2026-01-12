# ----------------------------
# Build stage
# ----------------------------
FROM node:20-alpine AS builder
WORKDIR /app

# pnpm v9 고정 (v10 approve-builds 이슈 회피)
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 의존성 설치
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 소스 복사
COPY . .

# Prisma Client 생성 (linux-musl 환경에서 생성됨)
RUN pnpm prisma generate

# 빌드
RUN pnpm build


# ----------------------------
# Production stage
# ----------------------------
FROM node:20-alpine AS production
WORKDIR /app

# Prisma 런타임을 위한 필수 라이브러리
RUN apk add --no-cache openssl libc6-compat

# pnpm v9 고정
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 프로덕션 의존성만 설치 (husky 같은 prepare 스크립트 방지)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# 빌드 결과물 + prisma 스키마 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# ✅ Prisma Client(엔진 포함)만 builder에서 가져와서 덮어쓰기
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main.js"]
