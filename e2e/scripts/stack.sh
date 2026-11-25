#!/bin/sh
# Bring the e2e compose stack up (waiting for health) or tear it down.
# Usage: sh scripts/stack.sh up|down
set -eu
cd "$(dirname "$0")/.."
compose() {
  docker compose \
    --env-file compose.env \
    -f ../deploy/compose/compose.yaml \
    -f ../deploy/compose/compose.test.yaml \
    --profile test "$@"
}
case "${1:-}" in
  up) compose up -d --build --wait --wait-timeout 600 ;;
  down) compose down -v --remove-orphans ;;
  *) echo "usage: stack.sh up|down" >&2; exit 2 ;;
esac
