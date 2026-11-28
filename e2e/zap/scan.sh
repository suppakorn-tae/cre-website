#!/bin/sh
# OWASP ZAP passive scans (IO-266) against the running e2e stack: the baseline
# scan on the public pages, the baseline scan again with the e2e user's session
# cookie on the signed-in pages, and zap-api-scan on contracts/openapi in safe
# mode (no active attack). Never zap-full-scan.
#
#   pnpm --dir e2e run stack:up && pnpm --dir e2e run zap
#
# ZAP_TARGET  base URL (default https://localhost)
# ZAP_AUTH=0  skip the signed-in scans (no seed user, no Mailpit needed)
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

baseline() { # name path [zap options]
  name=$1 path=$2
  shift 2
  zap zap-baseline.py -t "$TARGET$path" -c rules.tsv -m 1 -I \
    -r "out/$name.html" -J "out/$name.json" "$@"
}

for path in /login /register /forgot-password /legal/terms /legal/retention; do
  baseline "public$(echo "$path" | tr / -)" "$path"
done

# The api definition: contracts/bundle.mjs merges paths/ and schemas/ into one file.
(cd "$ROOT" && node contracts/bundle.mjs)
cp "$ROOT/contracts/openapi/dist/openapi.yaml" "$OUT/openapi.yaml"

if [ "${ZAP_AUTH:-1}" = 1 ]; then
  pnpm exec playwright test -c zap/playwright.config.ts
  # Replace the Cookie header of every request ZAP sends.
  COOKIE=$(cat "$OUT/cookie.txt")
  AUTH="-config replacer.full_list(0).description=session -config replacer.full_list(0).enabled=true -config replacer.full_list(0).matchtype=REQ_HEADER -config replacer.full_list(0).matchstring=Cookie -config replacer.full_list(0).regex=false -config replacer.full_list(0).replacement=$COOKIE"
  for path in /dashboard /projects /projects/new /account; do
    baseline "signed-in$(echo "$path" | tr / -)" "$path" -z "$AUTH"
  done
  zap zap-api-scan.py -t /zap/wrk/out/openapi.yaml -f openapi -O "$TARGET" -S -I \
    -c rules.tsv -r out/api.html -J out/api.json -z "$AUTH"
else
  zap zap-api-scan.py -t /zap/wrk/out/openapi.yaml -f openapi -O "$TARGET" -S -I \
    -c rules.tsv -r out/api.html -J out/api.json
fi

rm -f "$OUT/cookie.txt" "$OUT/openapi.yaml"
python3 zap/check.py
