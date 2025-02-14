# Use the official Bun image
FROM oven/bun:canary-debian AS base
ENV TURBO_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y openssl curl tini && rm -rf /var/lib/apt/lists/*

# Builder stage
FROM base AS builder
WORKDIR /app
RUN bun add turbo -g
COPY . .
RUN turbo prune @briefer/api --docker

# Installer stage
FROM base AS installer
WORKDIR /app
# Copy necessary files
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/bun.lockb ./bun.lockb  # Changed from yarn.lock
RUN bun install
# Build the project
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
# Turbo remote caching
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM
ARG TURBO_TOKEN
ENV TURBO_TOKEN=$TURBO_TOKEN
RUN bun turbo run build --filter=@briefer/api...  # Changed from bunx to bun

# Runner stage
FROM base AS runner
WORKDIR /app
# Create non-root user
RUN groupadd -r briefer && useradd -r -g briefer briefer \
    && mkdir -p /home/briefer/Downloads \
    && chown -R briefer:briefer /home/briefer
COPY --from=installer /app .
# Update Prisma permissions
RUN chown -R briefer:briefer /app/node_modules/@prisma/engines
USER briefer
# Use tini as init system
ENTRYPOINT ["tini", "--"]
CMD ["bun", "run", "apps/api/dist/src/index.js"] 
