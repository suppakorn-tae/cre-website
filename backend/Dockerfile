# syntax=docker/dockerfile:1.7

# Build context: backend/ (see deploy/compose/compose.yaml).
# Targets: api, worker, migrate. Migrations and PDF fonts are embedded in
# the binaries, so the runtime images carry nothing but the binary.

FROM golang:1.27.4-alpine3.23 AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOFLAGS=-trimpath GOTOOLCHAIN=local

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags="-s -w" -o /out/api ./cmd/api \
 && go build -ldflags="-s -w" -o /out/worker ./cmd/worker \
 && go build -ldflags="-s -w" -o /out/migrate ./cmd/migrate

# Shared runtime base: alpine (not distroless) because the healthchecks use
# busybox wget and the binaries have no healthcheck subcommand.
FROM alpine:3.23.3 AS runtime
RUN apk add --no-cache ca-certificates tzdata \
 && addgroup -S -g 10001 app \
 && adduser -S -u 10001 -G app -H -s /sbin/nologin app
USER 10001:10001

FROM runtime AS api
COPY --from=build /out/api /usr/local/bin/api
ENV HTTP_ADDR=:4000
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:4000/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/api"]

FROM runtime AS worker
COPY --from=build /out/worker /usr/local/bin/worker
ENV HTTP_ADDR=:4001
EXPOSE 4001
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:4001/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/worker"]

# One-shot job: runs to completion, so no healthcheck.
FROM runtime AS migrate
COPY --from=build /out/migrate /usr/local/bin/migrate
ENTRYPOINT ["/usr/local/bin/migrate"]
CMD ["up"]
