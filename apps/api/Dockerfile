# Use the official Bun image with Debian for better compatibility
FROM oven/bun:canary-debian AS base
ENV TURBO_TELEMETRY_DISABLED=1

# Install necessary system dependencies
RUN apt-get update -y && \
    apt-get install -y openssl curl tini && \
    rm -rf /var/lib/apt/lists/*

# Builder stage
FROM base AS builder
WORKDIR /app
RUN bun add -g turbo
COPY . .
RUN turbo prune @briefer/api --docker

# Installer stage
FROM base AS installer
WORKDIR /app

# Copy necessary files
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/bun.lockb ./bun.lockb
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Install dependencies
RUN bun install --frozen-lockfile

# Turbo remote caching setup
ARG TURBO_TEAM
ENV TURBO_TEAM=$TURBO_TEAM
ARG TURBO_TOKEN
ENV TURBO_TOKEN=$TURBO_TOKEN

# Build the project
RUN bun turbo run build --filter=@briefer/api...

# Runner stage
FROM base AS runner
WORKDIR /app

# Create non-root user (matching the original expressjs configuration)
RUN groupadd -r expressjs && useradd -r -g expressjs expressjs \
    && mkdir -p /home/expressjs/Downloads \
    && chown -R expressjs:expressjs /home/expressjs

# Copy built application
COPY --from=installer /app .

# Update Prisma permissions - updated to use expressjs user
RUN chown -R expressjs:expressjs /app/node_modules/@prisma/engines

# Switch to non-root user
USER expressjs

# Use tini as init system and start with Bun
ENTRYPOINT ["tini", "--"]
CMD ["bun", "run", "apps/api/dist/src/index.js"]