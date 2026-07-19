FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM base AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

FROM base AS builder
WORKDIR /app

ENV DATABASE_URL=postgresql://outline:outline@postgres:5432/outline
ENV DATABASE_SCHEMA=schedule
ENV NEXTAUTH_URL=https://schedule.qt.local
ENV AUTH_URL=https://schedule.qt.local
ENV APP_URL=https://schedule.qt.local
ENV OUTLINE_URL=https://outline.qt.local
ENV ALLOW_EMAIL_LOGIN=false

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN NEXTAUTH_SECRET=docker-build-only-nextauth-secret \
    AUTH_SECRET=docker-build-only-nextauth-secret \
    SCHEDULE_SSO_SECRET=docker-build-only-sso-secret \
    npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=production-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/server.cjs ./server.cjs

USER nextjs

EXPOSE 3000

CMD ["node", "server.cjs"]
