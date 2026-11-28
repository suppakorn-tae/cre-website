# Repo structure

What each folder holds, and where new code goes. Rules for agents (ownership, hard rules) are in [AGENTS.md](../AGENTS.md); conventions for branches, commits and PRs are in [CONTRIBUTING.md](../CONTRIBUTING.md).

> [!NOTE]
> **Generated, do not edit by hand.** Run `make gen` instead:
> `backend/internal/http/api/api.gen.go`, `backend/internal/dal/sqlc/`, `web/src/lib/api/generated/`, `web/public/mockServiceWorker.js`, `contracts/openapi/dist/` (not committed).

## Top level

| Folder | What it is |
| --- | --- |
| [`backend/`](#backend) | Go module: the api, the worker and the migrate binaries |
| [`web/`](#web) | Next.js app (TypeScript) |
| [`contracts/`](#contracts) | OpenAPI contract, the single source of the API shape |
| [`deploy/`](#deploy) | Docker Compose files, Caddy config, backup container |
| [`e2e/`](#e2e) | Playwright end-to-end tests and their stack |
| [`loadtest/`](#loadtest) | k6 load test, its stack, seed and results |
| [`docs/`](#docs) | Specs, runbooks, accessibility reports, brand assets |
| `.github/` | CI workflows (`ci.yml`, `ci-e2e.yml`, `pr-lint.yml`, `release.yml`), Dependabot, CODEOWNERS, PR template |

Root files: `Makefile` (all commands, see the [README](../README.md#-commands)), `package.json` and `pnpm-workspace.yaml` (pnpm workspace: `web`, `e2e`), `commitlint.config.js`, `.nvmrc`.

## backend

A request flows **handler → service → repository (sqlc) → PostgreSQL**. Each layer only calls the one below it.

```text
backend/
├── cmd/
│   ├── api/          HTTP server entry point
│   ├── worker/       Background job runner entry point (reports, exports, sweeps)
│   └── migrate/      Runs migrations, seeds the catalogue, sets up the app DB role
├── internal/
│   ├── http/
│   │   ├── router.go       Mounts every domain's routes (shared file: hotspot)
│   │   ├── wire.go         Builds services and handlers from Deps
│   │   ├── api/            Generated server interfaces and types (oapi-codegen)
│   │   ├── handler/<domain>/   Decode → call service → encode; routes.go + handler.go per domain
│   │   └── middleware/     Session, CSRF, RBAC, rate limit, request id, errors
│   ├── service/<domain>/   Business rules and transactions, one package per domain
│   ├── engine/             Pure Risk Engine: X, y1, y2, y3 → RL, RI, RM, level, advice keys (no DB)
│   ├── dal/
│   │   ├── queries/<domain>.sql   Hand-written SQL, input for sqlc
│   │   ├── sqlc/                  Generated Go for those queries
│   │   └── tx.go                  Transaction helper shared by repositories
│   ├── adapter/            Clients for outside systems: mailer, oidc (Google), pdf (Gotenberg),
│   │                       queue (asynq), s3 (RustFS), valkey
│   ├── worker/             Job handlers: report/ (PDF), export/ (research ZIP),
│   │                       sweep/ (expired exports, stuck jobs), runtime/ (job lifecycle)
│   ├── platform/           Cross-cutting plumbing: app/ (Deps), health/ (probes),
│   │                       httpserver/ (graceful shutdown), log/ (JSON slog), metrics/ (Prometheus)
│   ├── config/             Typed configuration from environment variables
│   ├── seed/               Loads the indicator catalogue into the DB (insert-if-absent)
│   ├── securitytest/       Black-box tests of every route: ownership, CSRF, rate limits
│   ├── testutil/           Test Postgres, row fixtures, contract/ (responses checked against OpenAPI)
│   └── domain/             Empty placeholder; domain types live in their service packages
├── migrations/       Timestamped up/down SQL (golang-migrate). Shared: never edit from a feature branch
├── seed/             Catalogue seed files (indicators, advice), embedded into migrate
└── templates/
    ├── report/       PDF report: HTML template, CSS, Thai strings, logos
    ├── mail/         OTP and Google e-mail templates
    └── fonts/        Sarabun fonts sent to Gotenberg (SIL OFL)
```

Domains (same name in `handler/`, `service/`, `dal/queries/`, `contracts/openapi/paths/`): account, admin, assessments, auth, catalogue, compare, dashboard, jobs, projects, reports, results, versions. Some services have no handler of their own (audit, session, export).

## web

```text
web/
├── src/
│   ├── app/                Routes only (thin pages that render a feature)
│   │   ├── (auth)/         login, register, forgot-password
│   │   ├── (app)/          Signed-in pages: dashboard, projects/…/versions/[v]/{assess,results,plan}, account
│   │   ├── (admin)/admin/  Admin pages (admin role only)
│   │   ├── (legal)/legal/  Terms and retention notice
│   │   ├── (dev)/          Dev-only pages: /dev/components (UI kit preview), /mock-sample
│   │   ├── healthz/        Liveness probe
│   │   └── layout.tsx, error.tsx, not-found.tsx, icon.png, apple-icon.png, favicon.ico
│   ├── features/<feature>/ Everything for one screen area: components, api.ts (queries), rules,
│   │                       mocks.ts (sample data), CSS module, tests
│   ├── components/ui/      Shared UI kit: Button, Field, Select, DatePicker, DataTable, Toast,
│   │                       Stepper, Icon, Logo, charts … (index.ts exports them)
│   ├── lib/
│   │   ├── api/            API client (browser and server), error mapping, generated/ types
│   │   ├── i18n/           next-intl setup, message catalogue loading
│   │   ├── format/         Locale formatting (Buddhist-era dates, baht)
│   │   ├── theme/          Light/dark theme switching
│   │   ├── security/       CSP builder and nonce
│   │   ├── meta/           Page titles
│   │   ├── mocks/          Mock-mode switch and MSW start-up
│   │   ├── query/          TanStack Query provider
│   │   └── contrast*.ts    Colour-contrast pairs and their checks
│   ├── mocks/              MSW handlers and sample data (auth, catalogue, jobs)
│   ├── styles/tokens.css   Design tokens: the single source of colours, spacing, type
│   └── proxy.ts            Per-request CSP header (Next 16's name for middleware)
├── messages/th/<feature>.json   Thai UI strings, one file per feature
├── public/             Static files: brand/ logos, MSW service worker
├── scripts/            i18n-lint.mjs (no hard-coded text), pseudo-locale.mjs (30% longer strings)
└── AGENTS.md           Next.js 16 notes for coding agents (written by next dev)
```

Features: account, admin (users, advice, thresholds, audit, export), assessment, auth (login, register, reset), compare, dashboard, legal, plan, projects, reports, results (overview, table, heatmap, hvh), shell (header, menus, session gate, step indicator), versions.

Styling rules are in [`web/README.md`](../web/README.md).

## contracts

```text
contracts/
├── openapi/
│   ├── openapi.yaml          Root spec
│   ├── paths/<domain>.yaml   Endpoints per domain
│   └── schemas/<domain>.yaml Types per domain
├── bundle.mjs                Joins them into openapi/dist/openapi.yaml (generated)
└── codegen/oapi-codegen.yaml Go server generation config
```

Shared: change it only in a `contract` issue, then run `make gen`.

## deploy

```text
deploy/
├── compose/
│   ├── compose.yaml          Base stack: caddy, web, api, worker, db, valkey, rustfs, gotenberg, migrate, mailpit
│   ├── compose.prod.yaml     Production overrides
│   ├── compose.backup.yaml   Optional backup profile
│   ├── compose.test.yaml     Stack for e2e tests
│   ├── Caddyfile             Dev proxy (local CA)
│   ├── Caddyfile.prod        Production proxy, TLS and security headers
│   └── env.prod.example      Production env template (dev template: .env.example)
├── backup/                   pgBackRest container: scripts, restore check, metrics, tests
├── init-env.sh               Writes .env.prod for the first deploy
└── test/                     Shell tests for the Caddyfiles and init-env.sh
```

## e2e

```text
e2e/
├── tests/          Real-api tests on the e2e stack: auth, assessment, admin, shell, a11y, meta (titles, headers)
├── mock/           Mock-mode tests (no Docker): pages, dark mode, contrast, target size, CSP …
├── helpers/        a11y.ts (axe), api.ts, mailpit.ts (read OTPs), env.ts, test.ts (fixtures)
├── scripts/stack.sh          Brings the e2e stack up and down
├── playwright.config.ts      Real-api config
└── playwright.mock.config.ts Mock-mode config
```

## loadtest

`k6/load.js` (scenario), `compose.loadtest.yaml` (2 api replicas), `seed.sql`, `run.sh` (up, test, down) and [`RESULTS.md`](../loadtest/RESULTS.md) (latest numbers).

## docs

| Folder | What it is |
| --- | --- |
| [`specs/`](specs/README.md) | Requirements, risk engine, architecture, database, user flow, UX/UI (hi-fi, wireframes, review feedback). **The source of truth.** |
| [`runbooks/`](runbooks/dev.md) | `dev.md` (run it locally), `deploy.md` (production), `restore.md` (backups) |
| [`a11y/`](a11y/audit-2026-11.md) | WCAG 2.2 AA audit and the colour-contrast report |
| [`brand/`](brand/README.md) | Logo, mark and app icons (the source; copied into `web/` and `backend/templates/report/`) |

## Where does new code go?

| You are adding… | Put it in |
| --- | --- |
| An API endpoint | `contracts/openapi/paths/<domain>.yaml` (contract issue) → `make gen` → `handler/<domain>/` → `service/<domain>/` → `dal/queries/<domain>.sql` |
| A database change | `backend/migrations/` (timestamped up and down; infra issue) |
| A scoring rule | `backend/internal/engine/` (pure, with table tests) |
| A call to an outside system | `backend/internal/adapter/<name>/` |
| A background job | `backend/internal/worker/<job>/` |
| A screen or part of one | `web/src/features/<feature>/`, its route in `web/src/app/`, strings in `web/messages/th/<feature>.json` |
| A component used by several features | `web/src/components/ui/` (export it from `index.ts`) |
| A colour, size or spacing value | A token in `web/src/styles/tokens.css` |
| Sample data for mock mode | `web/src/features/<feature>/mocks.ts`, handlers in `web/src/mocks/` |
| An end-to-end test | `e2e/tests/` (needs the real api) or `e2e/mock/` (UI only) |
