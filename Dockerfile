# Multi-stage Coolify-friendly image
FROM node:20-alpine AS deps
WORKDIR /app
# Coolify may inject NODE_ENV=production as a build ARG — that makes `npm ci`
# skip devDependencies (tailwind postcss, typescript) and break `next build`.
# Force development for install regardless of Coolify ARGs.
RUN export NODE_ENV=development && true
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN NODE_ENV=development npm ci --include=dev

FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Do not bake secrets into the image — unset common Coolify-injected ARGs for build.
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# Webpack build is more reliable in Docker than Turbopack for this app.
RUN NODE_ENV=production npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/scripts/docker-start.sh ./scripts/docker-start.sh
RUN chmod +x ./scripts/docker-start.sh \
  && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Migrate then serve — DATABASE_URL required at runtime
CMD ["sh", "./scripts/docker-start.sh"]
