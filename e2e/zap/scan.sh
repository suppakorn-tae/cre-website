#!/bin/sh
# OWASP ZAP passive scans (IO-266) against the running e2e stack:
#   1. zap-baseline on the public pages,
#   2. zap-api-scan on contracts/openapi in safe mode (no active attack),
#   3. a spider and the whole api definition as the e2e user (signed-in.yaml).
# Never zap-full-scan.
#
#   pnpm --dir e2e run stack:up && pnpm --dir e2e run zap
#
# ZAP_TARGET  base URL (default https://localhost)
# ZAP_AUTH=0  skip scan 3 (no seed user, no Mailpit needed)
# Reports land in e2e/zap/out (HTML and JSON). check.py fails on any medium or
# high alert.
set -eu
cd "$(dirname "$0")/.."
ROOT=$(cd .. && pwd)
TARGET=${ZAP_TARGET:-https://localhost}
IMAGE=${ZAP_IMAGE:-zaproxy/zap-stable:2.17.0}
OUT=zap/out

# The session cookie, the plan with it and the bundled api file stay outside
# e2e/zap/out, which CI uploads as an artifact. Removed on every exit.
SECRET=$(mktemp -d)
trap 'rm -rf "$SECRET"' EXIT
chmod 755 "$SECRET" # the container user is not the runner user

rm -rf "$OUT"
mkdir -p "$OUT"
chmod 777 "$OUT"

# ZAP runs on the host network, so https://localhost is the Caddy of the stack.
# zap(max_rc, args): the baseline and api scans exit 0 when clean, 1 on a FAIL rule
# and 2 on a WARN rule, so they pass max_rc 2 and check.py decides. An automation
# plan exits 0 or 1, and 1 is a failed plan, so it passes max_rc 0.
zap() {
  max=$1
  shift
  set +e
  docker run --rm --network host -v "$PWD/zap:/zap/wrk:rw" -v "$SECRET:/zap/in:ro" "$IMAGE" "$@"
  rc=$?
  set -e
  if [ "$rc" -gt "$max" ]; then
    echo "ZAP failed with exit code $rc" >&2
    exit "$rc"
  fi
}

for path in /login /register /forgot-password /legal/terms /legal/retention; do
  zap 2 zap-baseline.py -t "$TARGET$path" -c rules.tsv -m 1 -I \
    -r "out/public$(echo "$path" | tr / -).html" -J "out/public$(echo "$path" | tr / -).json"
done

# The api definition: contracts/bundle.mjs merges paths/ and schemas/ into one file.
(cd "$ROOT" && node contracts/bundle.mjs)
cp "$ROOT/contracts/openapi/dist/openapi.yaml" "$SECRET/openapi.yaml"
zap 2 zap-api-scan.py -t /zap/in/openapi.yaml -f openapi -O "$TARGET" -S -I \
  -c rules.tsv -r out/api.html -J out/api.json

if [ "${ZAP_AUTH:-1}" = 1 ]; then
  ZAP_COOKIE_FILE="$SECRET/cookie.txt" pnpm exec playwright test -c zap/playwright.config.ts
  TARGET="$TARGET" COOKIE=$(cat "$SECRET/cookie.txt") python3 -I -c '
import os, sys
plan = open(sys.argv[1], encoding="utf-8").read()
plan = plan.replace("__TARGET__", os.environ["TARGET"]).replace("__COOKIE__", os.environ["COOKIE"])
open(sys.argv[2], "w", encoding="utf-8").write(plan)
' zap/signed-in.yaml "$SECRET/plan.yaml"
  zap 0 zap.sh -cmd -autorun /zap/in/plan.yaml
fi

python3 zap/check.py
