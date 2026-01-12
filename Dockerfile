# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@latest --activate

# 의존성 파일 복사
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 소스 코드 복사
COPY . .

# Prisma Client 생성
RUN pnpm prisma generate

# 빌드
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@latest --activate

# 프로덕션 의존성만 설치 (prepare 스크립트 건너뛰기 - husky는 devDependency이므로)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Prisma 스키마 복사 및 Prisma Client 생성
COPY --from=builder /app/prisma ./prisma
# prisma CLI는 devDependency이므로 임시로 설치하여 generate 실행
RUN pnpm add -D prisma@^5.22.0 && pnpm prisma generate && pnpm remove prisma

# 포트 노출
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 앱 실행
CMD ["node", "dist/main.js"]

