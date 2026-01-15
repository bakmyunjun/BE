# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Prisma Client 생성(빌드에 필요하면 여기서)
RUN pnpm prisma generate

# 빌드
RUN pnpm build


# Production stage
FROM node:20-alpine AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production
ENV HUSKY=0
ENV CI=true

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ✅ 런타임에서 Prisma Client 필요하니 production에서 다시 generate
COPY --from=builder /app/prisma ./prisma
RUN pnpm prisma generate

# dist 복사
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
