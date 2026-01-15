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

# 프로덕션 의존성만 설치
COPY package.json pnpm-lock.yaml ./
# husky 방지 (컨테이너 빌드에서 prepare 훅 꼬이는 것 예방)
RUN HUSKY=0 pnpm install --frozen-lockfile --prod

# 빌드된 파일 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# 포트 노출
EXPOSE 3000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 앱 실행
CMD ["node", "dist/main.js"]

