# syntax=docker/dockerfile:1.6

# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
# (선택) BuildKit 켜져 있으면 pnpm store 캐시로 빌드 속도 개선 가능
# pnpm 도커 권장 방식 참고 :contentReference[oaicite:3]{index=3}
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

COPY . .

RUN pnpm prisma generate
RUN pnpm build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app

# Prisma 런타임을 위해 OpenSSL 설치 권장 :contentReference[oaicite:4]{index=4}
RUN apk add --no-cache openssl libc6-compat

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# prisma CLI를 add/remove 하지 말고, dlx로 1회 실행(깔끔/재현성↑)
RUN pnpm dlx prisma@5.22.0 prisma generate

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/main.js"]
