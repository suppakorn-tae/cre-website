#!/bin/sh
# Tests for the image pinning in deploy.sh (IO-245). POSIX sh, no docker:
# a stub `docker` on PATH answers digests and records compose calls.
#   sh deploy/backup/test/deploy_test.sh
set -u
here=$(cd "$(dirname "$0")" && pwd)
ds="$here/../deploy.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fails=0

mkdir "$work/bin"
cat >"$work/bin/docker" <<'EOF'
#!/bin/sh
# Digest = sha256 of "<ref><STUB_SALT>"; STUB_SALT moves a tag.
dig() { printf 'sha256:%s' "$(printf '%s%s' "$1" "${STUB_SALT:-}" | sha256sum | cut -c1-64)"; }
case "$1" in
  buildx)
    [ -z "${STUB_NO_BUILDX:-}" ] || exit 1
    ref=$6
    case "$ref" in *"${STUB_MISSING:-@none@}"*) exit 1 ;; esac
    printf '"%s"\n' "$(dig "$ref")"
    ;;
  pull)
    case "$3" in *"${STUB_MISSING:-@none@}"*) exit 1 ;; esac
    ;;
  image) printf '%s@%s\n' "${5%:*}" "$(dig "$5")" ;;
  compose)
    echo "compose $* api=${IMAGE_DIGEST_API:-} web=${IMAGE_DIGEST_WEB:-}" >>"$DOCKER_LOG"
    ;;
esac
EOF
chmod +x "$work/bin/docker"

reg=ghcr.io/acme/cre
sha=0123456789abcdef0123456789abcdef01234567
digest() { printf 'sha256:%s' "$(printf '%s%s' "$1" "${2:-}" | sha256sum | cut -c1-64)"; }

# A complete .env.prod from init-env.sh; each run appends its own lines,
# which win because the later assignment overrides the earlier one.
base="$work/base.env"
env INIT_IMAGE_REGISTRY=ghcr.io/acme/cre INIT_IMAGE_TAG=$sha \
  INIT_ACME_EMAIL=ops@example.com INIT_GOOGLE_CLIENT_ID=id.apps.googleusercontent.com \
  INIT_GOOGLE_CLIENT_SECRET=gs INIT_SMTP_USER=u INIT_SMTP_PASSWORD=p \
  INIT_BACKUP_S3_ENDPOINT=https://s3.example.net INIT_BACKUP_S3_REGION=eu \
  INIT_BACKUP_S3_BUCKET=b INIT_BACKUP_LOCK_S3_BUCKET=l INIT_BACKUP_S3_KEY=k \
  INIT_BACKUP_S3_SECRET=s bash "$here/../../init-env.sh" --non-interactive \
  --output "$base" >/dev/null 2>&1 || {
  echo "FAIL could not generate the base env file"
  exit 1
}

# ds_run <env-file-lines> <extra env...> -- <deploy.sh args...>
ds_run() {
  { cat "$base"; printf '%s\n' "$1"; } >"$work/env"
  chmod 600 "$work/env"
  shift
  envs=
  while [ "$1" != -- ]; do
    envs="$envs $1"
    shift
  done
  shift
  : >"$work/docker.log"
  # shellcheck disable=SC2086
  out=$(env -i PATH="$work/bin:$PATH" HOME="$work" DOCKER_LOG="$work/docker.log" \
    ENV_FILE="$work/env" DIGEST_FILE="$work/digests" $envs sh "$ds" "$@" 2>&1)
  code=$?
}

check() {
  name=$1
  shift
  if "$@"; then echo "ok   $name"; else
    echo "FAIL $name: exit $code: $out"
    fails=$((fails + 1))
  fi
}
has() { grep -q -- "$1" "$2"; }
said() { printf '%s' "$out" | grep -q -- "$1"; }

prod="BACKUP_ENABLED=false
IMAGE_REGISTRY=$reg"
extra=COMPOSE_EXTRA=compose.prod.yaml

for bad in latest main feature/x 0123456 v1.4 1.4.0 "$sha-dirty"; do
  rm -f "$work/digests"
  ds_run "$prod
IMAGE_TAG=$bad" $extra -- pull
  check "refuse IMAGE_TAG=$bad" [ "$code" = 1 ]
  check "refuse IMAGE_TAG=$bad message" said "latest and branch names are refused"
  check "refuse IMAGE_TAG=$bad no compose" [ ! -s "$work/docker.log" ]
done

ds_run "$prod
IMAGE_TAG=" $extra -- pull
check "refuse empty IMAGE_TAG" [ "$code" = 1 ]

# Version: pull resolves and records all four digests, compose runs with them.
rm -f "$work/digests" "$work/digests.log"
ds_run "$prod
IMAGE_TAG=v1.4.0
IMAGE_DIGEST_API=sha256:stale" $extra -- pull --ignore-buildable
check "pull version exit 0" [ "$code" = 0 ]
for i in api worker migrate web; do
  I=$(printf '%s' "$i" | tr '[:lower:]' '[:upper:]')
  check "record $i" has "^IMAGE_DIGEST_$I=$(digest "$reg/cre-$i:v1.4.0")\$" "$work/digests"
done
check "record tag" has "^IMAGE_PIN_TAG=v1.4.0\$" "$work/digests"
check "compose pull uses pinned digest" has "compose .*pull --ignore-buildable api=$(digest "$reg/cre-api:v1.4.0") " "$work/docker.log"
check "compose gets prod file" has "compose.prod.yaml" "$work/docker.log"

# The tag moves after pull: up still runs the pulled digests and logs them.
ds_run "$prod
IMAGE_TAG=v1.4.0" $extra STUB_SALT=moved -- up -d
check "up exit 0" [ "$code" = 0 ]
check "up uses pulled digest" has "compose .*up -d api=$(digest "$reg/cre-api:v1.4.0") web=$(digest "$reg/cre-web:v1.4.0")\$" "$work/docker.log"
check "up records deploy" has "tag=v1.4.0 commit=.* api=$(digest "$reg/cre-api:v1.4.0") worker=.* migrate=.* web=$(digest "$reg/cre-web:v1.4.0")\$" "$work/digests.log"

# Other commands read the pin and do not append to the history.
ds_run "$prod
IMAGE_TAG=v1.4.0" $extra -- ps -a
check "ps exit 0" [ "$code" = 0 ]
check "ps no history line" [ "$(wc -l <"$work/digests.log")" -eq 1 ]

# IMAGE_TAG changed without a new pull: refuse.
ds_run "$prod
IMAGE_TAG=v1.5.0" $extra -- up -d
check "up after tag change refused" [ "$code" = 1 ]
check "up after tag change message" said "run deploy.sh pull first"
check "up after tag change no compose" [ ! -s "$work/docker.log" ]

# No pin file at all: refuse.
rm -f "$work/digests"
ds_run "$prod
IMAGE_TAG=v1.4.0" $extra -- up -d
check "up without pin refused" [ "$code" = 1 ]

# Full SHA works; pre-release versions work.
for tag in "$sha" v2.0.0-rc.1; do
  ds_run "$prod
IMAGE_TAG=$tag" $extra -- pull
  check "pull $tag exit 0" [ "$code" = 0 ]
  check "pull $tag record" has "^IMAGE_DIGEST_WEB=$(digest "$reg/cre-web:$tag")\$" "$work/digests"
done

# Without buildx: pull the image and read its repo digest.
rm -f "$work/digests"
ds_run "$prod
IMAGE_TAG=v1.4.0" $extra STUB_NO_BUILDX=1 -- pull
check "fallback exit 0" [ "$code" = 0 ]
check "fallback record" has "^IMAGE_DIGEST_MIGRATE=$(digest "$reg/cre-migrate:v1.4.0")\$" "$work/digests"

# A missing image fails the pull and keeps the previous pin.
cp "$work/digests" "$work/digests.before"
ds_run "$prod
IMAGE_TAG=v1.4.1" $extra STUB_NO_BUILDX=1 STUB_MISSING=cre-worker -- pull
check "missing image exit 1" [ "$code" = 1 ]
check "missing image message" said "cannot resolve the digest of $reg/cre-worker:v1.4.1"
check "missing image keeps pin" cmp -s "$work/digests" "$work/digests.before"

# A leftover CHANGEME, a loose file mode or a bad secret stops pull and up
# before any compose call or digest lookup.
for cmd in pull up; do
  rm -f "$work/digests"
  ds_run "$prod
IMAGE_TAG=v1.4.0
SMTP_PASSWORD=CHANGEME-smtp" $extra -- $cmd
  check "$cmd with CHANGEME exit 1" [ "$code" = 1 ]
  check "$cmd with CHANGEME names the key" said "SMTP_PASSWORD is still CHANGEME"
  check "$cmd with CHANGEME says deploy stopped" said "failed the check"
  check "$cmd with CHANGEME no compose" [ ! -s "$work/docker.log" ]
  check "$cmd with CHANGEME no pin file" [ ! -f "$work/digests" ]
done
ds_run "$prod
IMAGE_TAG=v1.4.0" $extra -- pull
chmod 644 "$work/env"
rm -f "$work/digests"
out=$(env -i PATH="$work/bin:$PATH" HOME="$work" DOCKER_LOG="$work/docker.log" \
  ENV_FILE="$work/env" DIGEST_FILE="$work/digests" $extra sh "$ds" pull 2>&1)
code=$?
check "loose env file mode exit 1" [ "$code" = 1 ]
check "loose env file mode message" said "want 600 or 400"
ds_run "$prod
SESSION_SECRET=short" $extra -- pull
check "short secret exit 1" [ "$code" = 1 ]
# Commands other than pull and up do not run the check.
ds_run "$prod
IMAGE_TAG=v1.4.0
SMTP_PASSWORD=CHANGEME-smtp" $extra -- ps
check "ps skips the env check" [ -z "$(printf '%s' "$out" | grep 'failed the check')" ]

# Without compose.prod.yaml (dev, staging on local builds) nothing is pinned.
rm -f "$work/digests"
ds_run "BACKUP_ENABLED=false
IMAGE_TAG=latest" -- up -d
check "dev exit 0" [ "$code" = 0 ]
check "dev no pin file" [ ! -f "$work/digests" ]

[ "$fails" -eq 0 ] || {
  echo "$fails failure(s)"
  exit 1
}
echo "all passed"
