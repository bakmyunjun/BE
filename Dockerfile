FROM node:20-alpine AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV NODE_ENV=production
ENV HUSKY=0
ENV CI=true

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# prisma schema 복사
COPY --from=builder /app/prisma ./prisma

# ✅ 여기서 생성 (중요)
RUN pnpm prisma generate

# dist 복사
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
