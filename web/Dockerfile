# syntax=docker/dockerfile:1.7

# Build context: web/ (see deploy/compose/compose.yaml). The pnpm lockfile
# lives at the repo root, outside this context: it is used when present and
# the install is otherwise unlocked (see PR notes).

FROM node:24.22.3-alpine3.23 AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,target=/pnpm/store \
    if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    else pnpm install --no-frozen-lockfile; fi

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next 16 reads this to default `output` to "standalone" without a config edit.
ENV NEXT_PRIVATE_STANDALONE=true
RUN pnpm build \
 && test -f .next/standalone/server.js

FROM node:24.22.3-alpine3.23 AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
