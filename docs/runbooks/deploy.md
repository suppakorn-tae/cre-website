# Deploy runbook: production (conriskexpert.com)

Spec: Architecture v2.13 (Stack, Networking, Backup and recovery,
Kubernetes-readiness 1 and 6, Resolved in v2.13).
Files: `deploy/compose/compose.prod.yaml`, `deploy/compose/Caddyfile.prod`,
`deploy/compose/env.prod.example`, `.github/workflows/release.yml`.

## Images

`release.yml` runs on every push to `main` (and by hand) and pushes four
images to GHCR, each tagged with the full commit SHA:

`ghcr.io/<owner>/<repo>/cre-api`, `cre-worker`, `cre-migrate`, `cre-web`.

Production never builds on the server. Set `IMAGE_TAG` to the SHA you
want and `IMAGE_REGISTRY` to `ghcr.io/<owner>/<repo>`. To trace a running
container: `docker inspect --format '{{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}}' <container>`.
Use the same SHA for all four images. Log in to GHCR on the server with a
read-only token (`docker login ghcr.io`) if the packages are private.

## Secrets

- The server keeps one file, `.env.prod`, mode 600, owned by the deploy
  user. Create it from `deploy/compose/env.prod.example`. It is ignored by
  git (`.env.*` in `.gitignore`); never commit it, never paste it in
  tickets or chat.
- A copy of every secret also lives in the team secret store, with
  `BACKUP_CIPHER_PASS` kept off the server's own backup bucket.
- Rotate `SMTP_PASSWORD`, `GOOGLE_CLIENT_SECRET`, `BACKUP_S3_SECRET` by
  editing `.env.prod` and re-running the deploy command. Rotating
  `SESSION_SECRET` logs every user out.
- Compose fails at start with a clear message if a required variable is
  empty (`IMAGE_TAG`, `SESSION_SECRET`, `SMTP_*`, `GOOGLE_*`, `ACME_EMAIL`).

## One-time setup

### DNS and TLS

1. Add `A` (and `AAAA` if the host has IPv6) records for
   `conriskexpert.com` pointing to the server.
2. Open ports 80 and 443 to the internet; nothing else is published.
3. Caddy gets a Let's Encrypt certificate on first start (`ACME_EMAIL` in
   `.env.prod`). The `caddy-data` volume keeps it; do not delete the volume.

### Brevo (OTP e-mail)

1. In Brevo, add and verify the sending domain `conriskexpert.com`.
2. Publish the DNS records Brevo shows:
   - SPF: one TXT at the apex that includes Brevo, for example
     `v=spf1 include:spf.brevo.com ~all` (merge with any existing SPF).
   - DKIM: the `brevo1._domainkey` / `brevo2._domainkey` records Brevo gives.
   - DMARC: TXT `_dmarc` such as `v=DMARC1; p=none; rua=mailto:<ops mailbox>`;
     move to `quarantine` once reports are clean.
   - Brevo's `brevo-code` TXT verification record.
3. Create an SMTP key (SMTP & API, SMTP tab). `SMTP_USER` is the SMTP login
   shown there, `SMTP_PASSWORD` is the key.
4. Defaults in `compose.prod.yaml`: `smtp-relay.brevo.com`, port 587
   (STARTTLS), `SMTP_FROM=no-reply@conriskexpert.com`. Only `api` has
   outbound access (`egress-net`).

### Google sign-in

In Google Cloud Console, OAuth client (Web application):

- Authorized redirect URI: `https://conriskexpert.com/api/v1/auth/google/callback`
- Authorized JavaScript origin: `https://conriskexpert.com`

Put the client id and secret in `.env.prod`.

### Backup

Set `BACKUP_ENABLED=true` and the `BACKUP_*` variables (bucket at a
different provider or region from the app host). Details, schedule and
restore steps are in [restore.md](restore.md).

## Deploy or upgrade

On the server, in `deploy/compose`, with the SHA in `.env.prod`:

```sh
set -a; . ../../.env.prod; set +a
export DB_IMAGE=cre-pgbackrest:local POSTGRES_ARCHIVE_MODE=on \
  COMPOSE_PROFILES=backup
../backup/preflight.sh
docker compose --env-file ../../.env.prod \
  -f compose.yaml -f compose.backup.yaml -f compose.prod.yaml \
  build backup
docker compose --env-file ../../.env.prod \
  -f compose.yaml -f compose.backup.yaml -f compose.prod.yaml \
  pull --ignore-buildable
docker compose --env-file ../../.env.prod \
  -f compose.yaml -f compose.backup.yaml -f compose.prod.yaml \
  up -d
```

The `migrate` service runs to completion before `api` and `worker` start.
Without backup (staging only), drop `compose.backup.yaml` and the three
exports of backup settings, and set `BACKUP_ENABLED=false`.

The production overlay is not yet understood by `deploy/backup/deploy.sh`
(it always uses `compose.yaml` plus `compose.backup.yaml`); the commands
above do the same steps by hand. Follow-up: let the wrapper accept an
extra compose file.

## Verify

1. `docker compose ... ps`: all services healthy, no `mailpit`.
2. `curl -fsS https://conriskexpert.com/api/v1/healthz`.
3. Sign up with an e-mail address: the OTP arrives from Brevo (check
   Brevo transactional logs if not).
4. Sign in with Google: the callback returns to the app.
5. Backup: `docker compose ... exec backup pgbackrest --stanza=cre info`
   shows a full backup in repo1, then run the restore check from
   [restore.md](restore.md).
6. Confirm the SHA with the `docker inspect` command above.

## Roll back

Set `IMAGE_TAG` to the previous SHA and run the deploy commands again.
Migrations are forward only: if the bad release ran one, restore from
backup instead (see [restore.md](restore.md)), or ship a fix forward.

## Staging acceptance checklist (IO-80)

- [ ] Real OTP delivered through Brevo
- [ ] Google sign-in completes
- [ ] First full backup in the S3-compatible bucket, restore check passes
- [ ] Running images match the intended commit SHA
