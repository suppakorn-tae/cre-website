#!/usr/bin/env bash
# Load test runner (IO-78). Needs only docker. From the repo root:
#   loadtest/run.sh up      build and start the stack (2 api replicas), seed it
#   loadtest/run.sh test    run k6 (DURATION=3m by default)
#   loadtest/run.sh down    stop the stack, delete volumes and the k6 image
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
K6_IMAGE="grafana/k6:1.4.2"
API_REPLICAS="${API_REPLICAS:-2}"
# One reproducible hash (Argon2id, same parameters as the api) of the password in k6/load.js.
HASH='$argon2id$v=19$m=19456,t=2,p=1$o24N2oFuWfN0QbSaC2MaHQ$EjXhLseg8m7MGZ8fTWPOMzaMY80n1dYurKSwsBXPVmQ'
DC=(docker compose --env-file "$ROOT/loadtest/compose.env"
  -f "${COMPOSE_YAML:-$ROOT/deploy/compose/compose.yaml}" -f "$ROOT/loadtest/compose.loadtest.yaml")

case "${1:-}" in
up)
  # web is not part of the test: Caddy only needs it to exist as a name.
  "${DC[@]}" up -d --build --wait --scale "api=$API_REPLICAS" \
    db valkey rustfs gotenberg migrate api worker
  "${DC[@]}" up -d --no-deps caddy
  "${DC[@]}" exec -T db psql -U cre_owner -d cre -v ON_ERROR_STOP=1 \
    -v "hash='$HASH'" <"$ROOT/loadtest/seed.sql"
  ;;
test)
  mkdir -p "$ROOT/loadtest/out"
  docker run --rm --network host --user "$(id -u):$(id -g)" \
    -e DEBUG="${DEBUG:-}" -e BASE_URL="${BASE_URL:-https://localhost}" -e DURATION="${DURATION:-3m}" \
    -v "$ROOT/loadtest/k6:/scripts:ro" -v "$ROOT/loadtest/out:/out" \
    "$K6_IMAGE" run /scripts/load.js
  ;;
down)
  "${DC[@]}" down -v --remove-orphans --rmi local
  docker rmi "$K6_IMAGE" || true
  ;;
*)
  echo "usage: $0 up|test|down" >&2
  exit 2
  ;;
esac
