# syntax=docker/dockerfile:1.7

# Build context: the repo root (see deploy/compose/compose.yaml), because the
# pnpm workspace files and lockfile live there and web mocks import
# backend/seed/cre-indicators.json. Ignore rules: the root .dockerignore.

FROM node:24.22.3-alpine3.23 AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
# Corepack reads the pnpm version from `packageManager` in package.json.
COPY package.json ./
RUN corepack enable && pnpm --version

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN --mount=type=cache,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter web...

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/web/node_modules ./web/node_modules
COPY pnpm-workspace.yaml ./
COPY web ./web
COPY backend/seed/cre-indicators.json ./backend/seed/cre-indicators.json
WORKDIR /app/web
# next.config.ts sets output: 'standalone' with the repo root as tracing root,
# so the server lands in .next/standalone/web/server.js.
RUN pnpm build \
 && test -f .next/standalone/web/server.js

FROM node:24.22.3-alpine3.23 AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./web/.next/static
COPY --from=build --chown=node:node /app/web/public ./web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "web/server.js"]
