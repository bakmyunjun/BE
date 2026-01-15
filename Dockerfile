# Build stage
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# OpenSSL 설치 (Prisma 필수)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# ✅ 빌드 전에 반드시 generate
RUN pnpm prisma generate

RUN pnpm build


# Production stage
FROM node:20-bookworm-slim AS production
WORKDIR /app

# OpenSSL 설치 (Prisma 필수)
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production
ENV HUSKY=0
ENV CI=true

COPY package.json pnpm-lock.yaml ./
# ✅ husky 같은 lifecycle 스크립트 막기
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# prisma schema 및 migrations 복사 (generate 및 마이그레이션 실행에 필요)
COPY --from=builder /app/prisma ./prisma

# ✅ production에서도 client/engine 생성 (devDependency 설치 없이)
RUN pnpm dlx prisma@5.22.0 generate

# 앱 빌드 결과 복사
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
