# Agent rules

## Specs

Source of truth, in [`docs/specs/`](docs/specs/README.md):

- Requirements & use cases v1.14 — `docs/specs/requirements/`
- Risk engine & indicators v1.1 — `docs/specs/risk-engine/`
- UX/UI wireframes + hi-fi UI — `docs/specs/ux-ui/`, user flow in `docs/specs/user-flow/`
- Architecture v2.3 (decisions v2.15) — `docs/specs/architecture/`
- Database design v1.1 — `docs/specs/database/`

If they disagree, label the Linear issue `needs-decision` and stop.

## Stack

Fixed. Do not pick alternatives.

- Backend: Go 1.27 (toolchain go1.27.4) + chi + oapi-codegen strict server; pgx v5 + sqlc; golang-migrate with timestamped files; asynq on Valkey.
- Web: Node 24.22.3 (`.nvmrc`), pnpm 10, Next.js 16.4.6 (TypeScript strict) + next-intl + TanStack Query + openapi-typescript + openapi-fetch + MSW.
- Quality: golangci-lint, gofumpt, ESLint, Prettier, Spectral.
- Tests: go test + testcontainers, Vitest, Playwright.
- Commits: commitlint.

## Loop for one issue

1. Pick one issue in Todo with no open blockers, assign yourself, move it to In Progress.
2. `git checkout main && git pull --rebase`, then create the branch named in the issue.
3. Read only the spec references in the issue, then the owned paths.
4. Write tests first for the acceptance criteria, implement, run `make gen lint test`.
5. Make small Conventional Commits with `Refs: IO-<n>`, push, open a draft PR after the first commit.
6. Rebase on main before marking ready, fill the PR template, move the issue to In Review.
7. Address review in new commits (no force-push after review starts, except rebase). A reviewer agent that did not write the code squash-merges when green, except PRs that need a human (see CONTRIBUTING.md, Merge rules).

## Hard rules

- Change only the issue's owned paths. If you need anything else (a contract field, a column, a shared component), stop, comment on the issue, and request a `contract` or `infra` issue.
- Never edit `contracts/`, `backend/migrations/`, `backend/internal/http/router.go` or `deploy/compose/compose.yaml` from a feature branch.
- Never recalculate results on read.
- Never let an admin path read other users' projects.
- No spec codes or English-only text in user-facing strings. Add keys to `web/messages/th/<feature>.json`.
- No new dependency without saying why in the PR.
- Never claim done with failing tests, TODOs in owned code or stale generated files.
- One issue at a time. No work outside an issue.

## Ownership

- Features own `handler/<domain>`, `service/<domain>`, `dal/queries/<domain>.sql`, `web/src/features/<feature>`, `web/messages/th/<feature>.json`, their route-group pages and tests.
- Generated code (`dal/sqlc`, `web/src/lib/api`, oapi-codegen output) is committed and regenerated with `make gen`.

## Definition of done

- [ ] Acceptance criteria met and ticked in Linear.
- [ ] Unit tests for services and engine; integration tests (testcontainers) for repositories and handlers.
- [ ] Handler responses match OpenAPI (contract test).
- [ ] Web screens match the hi-fi frame at desktop and mobile widths; all text comes from the catalogue.
- [ ] `make gen lint test` clean, CI green.
- [ ] PR title and commits pass commitlint, PR body complete, one approving review.
- [ ] Squash-merged, branch deleted.
