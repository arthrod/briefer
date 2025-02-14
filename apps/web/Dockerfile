FROM oven/bun:canary-debian AS base
ENV TURBO_TELEMETRY_DISABLED=1

FROM base AS builder
WORKDIR /app
RUN bun add turbo -g
COPY . .
RUN turbo prune @briefer/web --docker

FROM base AS installer
WORKDIR /app
# First install the dependencies
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/bun.lock ./bun.lockb
RUN bun install --frozen

# Build the project
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Environment variables
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_WS_URL
ENV NEXT_PUBLIC_API_WS_URL=$NEXT_PUBLIC_API_WS_URL
ARG NEXT_PUBLIC_PUBLIC_URL
ENV NEXT_PUBLIC_PUBLIC_URL=$NEXT_PUBLIC_PUBLIC_URL

RUN bun turbo run build --filter=@briefer/web...

FROM base AS runner
WORKDIR /app
# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=installer /app/apps/web/next.config.js .
COPY --from=installer /app/apps/web/package.json .
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/start.sh ./apps/web/start.sh

EXPOSE 4000
CMD ["bun", "run", "./apps/web/start.sh"]
