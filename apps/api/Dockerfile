FROM node:18-slim AS base
ENV TURBO_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y openssl curl tini python3 python-is-python3 build-essential && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
RUN yarn global add turbo
COPY . .
RUN turbo prune @briefer/api --docker

FROM base AS installer
WORKDIR /app
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/yarn.lock ./yarn.lock
RUN yarn install
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Debug steps
RUN ls -la
RUN yarn list cookie
# Ensure cookie package is installed
RUN yarn add cookie@0.7.1 -W
# Build step
RUN yarn turbo run build --filter=@briefer/api... --verbosity=2

FROM base AS runner
WORKDIR /app
RUN groupadd -r expressjs && useradd -r -g expressjs expressjs \
    && mkdir -p /home/expressjs/Downloads \
    && chown -R expressjs:expressjs /home/expressjs
COPY --from=installer /app .
RUN chown -R expressjs:expressjs /app/node_modules/@prisma/engines
USER expressjs
ENTRYPOINT ["tini", "--"]
# Add debugging for startup
CMD ["sh", "-c", "node", "--max-old-space-size=12000", "apps/api/dist/src/index.js"]
FROM node:18-slim AS base
ENV TURBO_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y openssl curl tini python3 python-is-python3 build-essential && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
RUN yarn global add turbo
COPY . .
RUN turbo prune @briefer/api --docker

FROM base AS installer
WORKDIR /app
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/yarn.lock ./yarn.lock
RUN yarn install
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Debug steps
RUN ls -la
RUN yarn list cookie
# Ensure cookie package is installed
RUN yarn add cookie@0.7.1 -W
# Build step
RUN yarn turbo run build --filter=@briefer/api... --verbosity=2

FROM base AS runner
WORKDIR /app
RUN groupadd -r expressjs && useradd -r -g expressjs expressjs \
    && mkdir -p /home/expressjs/Downloads \
    && chown -R expressjs:expressjs /home/expressjs
COPY --from=installer /app .
RUN chown -R expressjs:expressjs /app/node_modules/@prisma/engines
USER expressjs
ENTRYPOINT ["tini", "--"]
# Add debugging for startup
CMD ["node", "--max-old-space-size=12000", "apps/api/dist/src/index.js"]
