#!/bin/sh
# Security headers in the Caddyfiles (IO-264). POSIX sh.
#   sh deploy/test/caddyfile_test.sh
# With docker on PATH it also parses both files with Caddy itself.
set -u
here=$(cd "$(dirname "$0")" && pwd)
compose="$here/../compose"
prod="$compose/Caddyfile.prod"
dev="$compose/Caddyfile"
fails=0

ok() { echo "ok   $1"; }
fail() {
  echo "FAIL $1"
  fails=$((fails + 1))
}

# has <file> <name> <fixed line>: the trimmed line is in the file.
has() {
  if sed 's/^[[:space:]]*//' "$1" | grep -qxF -- "$3"; then ok "$2"; else fail "$2: lacks $3"; fi
}
# lacks <file> <name> <pattern>
lacks() {
  if grep -qE -- "$3" "$1"; then fail "$2: has $3"; else ok "$2"; fi
}

api_match='@api path /api/v*'
api_csp="header @api Content-Security-Policy \"default-src 'none'; frame-ancestors 'none'\""

for f in "$prod" "$dev"; do
  n=$(basename "$f")
  has "$f" "$n nosniff" 'X-Content-Type-Options "nosniff"'
  has "$f" "$n referrer" 'Referrer-Policy "strict-origin-when-cross-origin"'
  has "$f" "$n frame-options" 'X-Frame-Options "DENY"'
  has "$f" "$n permissions" 'Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"'
  has "$f" "$n coop" 'Cross-Origin-Opener-Policy "same-origin"'
  has "$f" "$n api matcher" "$api_match"
  has "$f" "$n api csp" "$api_csp"
  # The page CSP needs a per-request nonce, so only the web app may send it.
  if [ "$(grep -c 'Content-Security-Policy' "$f")" = 1 ]; then ok "$n csp on api only"; else
    fail "$n csp on api only: Content-Security-Policy is set more than once"
  fi
done

has "$prod" "prod hsts" 'Strict-Transport-Security "max-age=31536000; includeSubDomains"'
lacks "$prod" "prod hsts no preload" 'Strict-Transport-Security.*preload'
has "$prod" "prod hides server" '-Server'
lacks "$dev" "dev no hsts" 'Strict-Transport-Security'

# Parse with the Caddy image the stacks run (caddy:2-alpine in compose.yaml).
if command -v docker >/dev/null 2>&1; then
  for f in "$prod" "$dev"; do
    n=$(basename "$f")
    if out=$(docker run --rm -e ACME_EMAIL=ops@example.com -v "$f:/etc/caddy/Caddyfile:ro" \
      caddy:2-alpine caddy adapt --config /etc/caddy/Caddyfile 2>&1); then
      ok "$n parses"
    else
      fail "$n parses: $out"
    fi
  done
else
  echo "skip caddy adapt (no docker)"
fi

if [ "$fails" -ne 0 ]; then
  echo "$fails failure(s)"
  exit 1
fi
echo "all passed"
