# syntax=docker/dockerfile:1
# Production image for the API (modular monolith: HTTP API + in-process background work,
# including the job-alert scheduler). Build from the repository root:
#   docker build -f apps/api/Dockerfile -t job-assist-api .

FROM node:22-bookworm-slim AS build
WORKDIR /app
# npm 11 is required by this lockfile/workspace setup (npm 10 is not supported here).
RUN npm install -g npm@11.21.0
# `prisma generate` reads DATABASE_URL through prisma.config.ts; nothing connects to it at build time.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY package.json package-lock.json .npmrc ./
COPY packages/shared packages/shared
COPY packages/career-mentor-agent packages/career-mentor-agent
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
# Only the API and the packages it uses (the web app is built and hosted separately).
RUN npm ci --workspace=@job-assist/api --workspace=@job-assist/shared \
  --workspace=@job-assist/career-mentor-agent --include-workspace-root

COPY apps/api apps/api
# The API's prebuild step compiles @job-assist/career-mentor-agent first.
RUN npm run build -w @job-assist/api

FROM node:22-bookworm-slim AS runtime
# OpenSSL is needed by Prisma's migration engine.
RUN apt-get -o Acquire::Retries=5 update \
  && apt-get -o Acquire::Retries=5 install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000
# Apply pending migrations (idempotent), then start. Uses DIRECT_DATABASE_URL when set.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node --enable-source-maps dist/main.js"]
