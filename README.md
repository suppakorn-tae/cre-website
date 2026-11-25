# CRE: Construction Risk Expert

CRE is a web app for assessing construction risk on islands. A user creates a project, answers 55 risk indicators, and gets scores, a risk level and advice. The interface is in Thai.

Main features:

- Sign up by e-mail (OTP) or with Google, and log in.
- Projects with versions, and an assessment form per version.
- Stored results, a dashboard, and comparison between versions.
- PDF reports and exports, built in the background.
- An admin area for users, thresholds, advice and the audit log.

## Stack

| Part | Technology |
| --- | --- |
| Backend | Go, chi, oapi-codegen, pgx and sqlc, asynq |
| Web | Next.js, TypeScript, next-intl, TanStack Query, MSW |
| Database | PostgreSQL 16 |
| Queue and cache | Valkey |
| File storage (S3) | RustFS |
| PDF rendering | Gotenberg |
| Reverse proxy and TLS | Caddy |

Exact versions are in `backend/go.mod`, `.nvmrc` and the root `package.json`.

## Quick start

### Prerequisites

- Docker with the Compose plugin.
- Go (version in `backend/go.mod`).
- Node as in `.nvmrc`, with corepack.

### 1. Install dependencies

```sh
corepack enable
corepack pnpm install --frozen-lockfile
```

### 2. Create `.env`

```sh
cp deploy/compose/.env.example deploy/compose/.env
```

Set `SESSION_SECRET` in that file. The api refuses to start without it. Use at least 32 bytes, for example the output of:

```sh
openssl rand -hex 32
```

The other defaults are for local use only. Leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` empty: Google sign-in then answers 503. Never commit `.env`.

### 3. Start the stack

```sh
make up
```

The first start builds the images and takes a few minutes. Check it:

```sh
docker compose -f deploy/compose/compose.yaml ps
curl -k https://localhost/api/v1/healthz
```

Open <https://localhost>. Caddy signs the certificate with its own local CA, so the browser warns. Accept it for local work.

Stop with `make down`. To also delete the data, run `docker compose -f deploy/compose/compose.yaml down -v`.

### 4. Get an admin account

There is no admin sign-up. Sign up as a normal user, then promote the account in the database. These steps are for local development only. Never run them on a real deployment.

1. Sign up at <https://localhost> with an e-mail such as `admin@example.com`.
2. Read the OTP. In dev, e-mail goes to Mailpit, which is not published on the host. Read it from inside the network:

   ```sh
   docker compose -f deploy/compose/compose.yaml exec caddy wget -qO- http://mailpit:8025/api/v1/messages
   ```

   The OTP is in the `Subject` of the newest message. Enter it to finish sign-up.
3. Promote the account:

   ```sh
   docker compose -f deploy/compose/compose.yaml exec -T db psql -U cre_owner -d cre \
     -c "UPDATE account SET role = 'admin' WHERE email = 'admin@example.com'"
   ```

   Use your own `POSTGRES_USER` and `POSTGRES_DB` if you changed them in `.env`. The e2e suite does the same in `e2e/global-setup.ts`.

### Web only, on mocks

To work on screens without the backend, run the web app with the MSW mocks:

```sh
NEXT_PUBLIC_API_MOCKS=1 corepack pnpm --dir web dev
```

Open <http://localhost:3000>. The browser answers all API calls from the mocks in `web/src/mocks`.

## Common commands

Run them from the repo root.

| Command | What it does |
| --- | --- |
| `make up` / `make down` | Start or stop the compose stack |
| `make gen` | Regenerate the OpenAPI bundle, Go server and sqlc code, TypeScript types and the MSW worker |
| `make lint` | Spectral on the OpenAPI file, golangci-lint (or `go vet`), ESLint and the i18n check |
| `make test` | Backend and web tests (integration tests use testcontainers, so Docker must run) |
| `make test-backend` / `make test-web` | One side only |
| `make build` | Build the backend and the web app |

Run `make gen lint test` before you push. Generated code is committed, and CI fails if it is stale.

### End-to-end tests

The Playwright suite in `e2e/` runs against its own compose stack with throw-away secrets (`e2e/compose.env`). That stack also uses ports 80 and 443, so stop the dev stack first.

```sh
corepack pnpm --dir e2e exec playwright install chromium
corepack pnpm --dir e2e run stack:up
corepack pnpm --dir e2e test
corepack pnpm --dir e2e run stack:down
```

CI runs it nightly and on pull requests that touch `e2e/`: [`ci-e2e.yml`](.github/workflows/ci-e2e.yml).

### Load test

The k6 load test needs only Docker. It builds its own stack (two api replicas) and seeds a large data set.

```sh
loadtest/run.sh up     # build, start and seed
loadtest/run.sh test   # run k6, 3 minutes by default (DURATION=1m to shorten)
loadtest/run.sh down   # stop, delete volumes and the k6 image
```

Setup and results: [`loadtest/RESULTS.md`](loadtest/RESULTS.md).

## Repo layout

| Path | What is in it |
| --- | --- |
| `backend/` | Go code: `cmd/` (api, worker, migrate), `internal/` (http, service, engine, dal, worker), `migrations/`, `seed/` |
| `web/` | Next.js app, Thai message catalogue in `messages/th/`, MSW mocks in `src/mocks/` |
| `contracts/` | OpenAPI contract and code generation config |
| `deploy/` | Compose files in `compose/`, backup setup in `backup/` |
| `e2e/` | Playwright end-to-end tests and their compose stack |
| `loadtest/` | k6 scripts, seed data and the runner |
| `docs/` | Specs in `specs/`, runbooks in `runbooks/` |

## Docs

- [Specs](docs/specs/README.md): requirements, risk engine, architecture, database, UX/UI. They are the source of truth.
- [Deploy runbook](docs/runbooks/deploy.md), with [Google sign-in setup](docs/runbooks/deploy.md#google-sign-in).
- [Restore runbook](docs/runbooks/restore.md): backup and restore.
- [`AGENTS.md`](AGENTS.md): rules for coding agents.
- [`CONTRIBUTING.md`](CONTRIBUTING.md): branches, commits, pull requests, required checks.
