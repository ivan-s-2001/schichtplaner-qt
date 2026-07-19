FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
WORKDIR /app

# Non-sensitive build-time placeholders. Runtime values are supplied by
# Docker Compose when the final container starts.
ENV DATABASE_URL=postgresql://outline:outline@postgres:5432/outline
ENV DATABASE_SCHEMA=schedule
ENV NEXTAUTH_URL=http://localhost:41873
ENV APP_URL=http://localhost:41873
ENV ALLOW_EMAIL_LOGIN=false

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN NEXTAUTH_SECRET=docker-build-only-nextauth-secret \
    SCHEDULE_SSO_SECRET=docker-build-only-sso-secret \
    npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
