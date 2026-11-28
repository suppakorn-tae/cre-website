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

rm -rf "$OUT"
mkdir -p "$OUT"
chmod 777 "$OUT" # the container user is not the runner user

# ZAP runs on the host network, so https://localhost is the Caddy of the stack.
# Exit 0 is clean, 1 a FAIL rule and 2 a WARN rule. Only 3 and above (an error)
# stop here: check.py reads the JSON reports and decides.
zap() {
  set +e
  docker run --rm --network host -v "$PWD/zap:/zap/wrk:rw" "$IMAGE" "$@"
  rc=$?
  set -e
  if [ "$rc" -gt 2 ]; then
    echo "ZAP failed with exit code $rc" >&2
    exit "$rc"
  fi
}

for path in /login /register /forgot-password /legal/terms /legal/retention; do
  zap zap-baseline.py -t "$TARGET$path" -c rules.tsv -m 1 -I \
    -r "out/public$(echo "$path" | tr / -).html" -J "out/public$(echo "$path" | tr / -).json"
done

# The api definition: contracts/bundle.mjs merges paths/ and schemas/ into one file.
(cd "$ROOT" && node contracts/bundle.mjs)
cp "$ROOT/contracts/openapi/dist/openapi.yaml" "$OUT/openapi.yaml"
zap zap-api-scan.py -t /zap/wrk/out/openapi.yaml -f openapi -O "$TARGET" -S -I \
  -c rules.tsv -r out/api.html -J out/api.json

if [ "${ZAP_AUTH:-1}" = 1 ]; then
  pnpm exec playwright test -c zap/playwright.config.ts
  sed -e "s|__TARGET__|$TARGET|g" -e "s|__COOKIE__|$(cat "$OUT/cookie.txt")|" \
    zap/signed-in.yaml >"$OUT/plan.yaml"
  zap zap.sh -cmd -autorun /zap/wrk/out/plan.yaml
fi

rm -f "$OUT/cookie.txt" "$OUT/openapi.yaml" "$OUT/plan.yaml"
python3 zap/check.py
