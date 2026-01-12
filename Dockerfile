# ----------------------------
# Build stage (Debian/glibc)
# ----------------------------
  FROM node:20-bookworm-slim AS builder
  WORKDIR /app
  
  # OpenSSL + CA certs (Prisma 엔진/연결 안정성)
  RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
  
  # pnpm 고정
  RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
  
  # husky 방지 (컨테이너 빌드에서 prepare 훅 꼬이는 것 예방)
  ENV HUSKY=0
  
  # deps 설치
  COPY package.json pnpm-lock.yaml ./
  RUN pnpm install --frozen-lockfile
  
  # 소스 복사
  COPY . .
  
  # Prisma Client 생성 (builder에서 완료)
  RUN pnpm prisma generate
  
  # 앱 빌드
  RUN pnpm build
  
  # ✅ prod deps만 남기기 (pnpm 구조 유지)
  RUN pnpm prune --prod
  
  
  # ----------------------------
  # Production stage
  # ----------------------------
  FROM node:20-bookworm-slim AS production
  WORKDIR /app
  
  RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
  
  ENV NODE_ENV=production
  
  # 런타임에 필요한 것만 복사
  COPY --from=builder /app/package.json ./package.json
  COPY --from=builder /app/node_modules ./node_modules
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/prisma ./prisma
  
  EXPOSE 3000
  
  HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
  
  CMD ["node", "dist/main.js"]
  