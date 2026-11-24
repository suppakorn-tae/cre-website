# Contributing

## Branches

- Name: `<type>/IO-<n>-<short-kebab-slug>`, lowercase, at most 50 characters.
- Types: `feat`, `fix`, `chore`, `test`, `docs`, `ci`, `build`, `spike` (a spike is never merged as code).
- Branch from the latest `main`. One issue per branch.
- Rebase on main (`git pull --rebase origin main`). Never merge main into a branch.
- Delete the branch after merge.

## Commits

Conventional Commits 1.0, enforced by commitlint.

```
<type>(<scope>): <summary>

<body: why, not how; wrap at 72>

Refs: IO-<n>
```

- Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
- Scopes (fixed list): `api`, `worker`, `migrate`, `engine`, `db`, `auth`, `account`, `catalogue`, `projects`, `versions`, `assessments`, `results`, `dashboard`, `reports`, `jobs`, `admin`, `audit`, `export`, `web`, `ui`, `i18n`, `contracts`, `deploy`, `ci`, `e2e`, `repo`.
- Summary: imperative, lowercase, no period. Header at most 72 characters.
- One logical change per commit. Each commit compiles and passes tests.
- Breaking change: `!` after the scope and a `BREAKING CHANGE:` footer.

Example:

```
feat(engine): score RL for a–c only indicators

EC-HS-2 and EC-HS-5 have no d and e thresholds. Pick the branch
from the NULL pattern and reject any other pattern.

Refs: IO-23
```

## Commit identity

GitHub must show which teammate is responsible for each commit and PR, not a generic agent name.

- An agent commits as its human owner: set `git config user.name` and `git config user.email` in the clone to the owner's name and an email verified on the owner's GitHub account.
- An agent pushes and opens PRs with its owner's GitHub credentials, so the PR and the squash commit on `main` carry the owner's name.
- Optional: add a `Co-Authored-By: <agent name> <email>` trailer after `Refs: IO-<n>` to show the agent's part. It adds a co-author; it never replaces the owner.

## Pull requests

- Title = squash commit header + issue key: `<type>(<scope>): <summary> (IO-<n>)`.
- The title must match:
  `^(feat|fix|refactor|perf|test|docs|build|ci|chore|revert)\([a-z0-9-]+\)!?: [a-z].{3,68} \(IO-\d+\)$`
- Example: `feat(projects): add soft delete with version cascade (IO-40)`.
- Body: use the pull request template.
- Open a draft PR after the first commit.

## Required checks

Require exactly these three status checks on `main`:

| Check | Workflow | What it does |
| --- | --- | --- |
| `ci-ok` | `ci.yml` | Always runs. Fails if any area job failed or was cancelled; passes when jobs were skipped by the path filter |
| `pr-title` | `pr-lint.yml` | Title matches the PR title regex above |
| `commitlint` | `pr-lint.yml` | commitlint on every commit in the PR |

Path filtering is done per job inside `ci.yml` (job `changes`, using `dorny/paths-filter`), never with workflow-level `paths:`, so these three names always report. Do not mark the area jobs as required: when skipped they would stay Pending.

Area jobs behind `ci-ok`:

| Job | Runs when | What it does |
| --- | --- | --- |
| `backend` | `backend/**`, `contracts/**`, `Makefile` | gofumpt, golangci-lint, `go test ./...` with Postgres and Valkey |
| `web` | `web/**`, `contracts/**`, `Makefile`, root package files, `.nvmrc` | ESLint, Prettier, typecheck, Vitest, build |
| `contracts` | `contracts/**` | Spectral lint of the OpenAPI files |
| `codegen` | any backend or web trigger | `make gen`, then fails if `git status --porcelain` is not empty (stale or untracked generated code) |

Toolchain versions come from the repo: `backend/go.mod`, `.nvmrc` and `packageManager` in `package.json`.

## Merge rules

- CI green and PR title check passing.
- One approving review. Who reviews depends on what the PR touches:
  - **Most PRs:** a reviewer agent that did not write the code. It runs the review checklist in the Linear agent guide, posts its verdict as a PR comment, and squash-merges when CI is green and the verdict is APPROVE.
  - **Human review required (Tae):** PRs labelled `hotspot` or `needs-decision`, and any PR that changes `contracts/`, `backend/migrations/`, `backend/internal/http/router.go`, `deploy/` or `.github/workflows/`. A reviewer agent may still review these, but only a human merges them.
- Branch up to date with main.
- Squash merge only. The squash message is the PR title plus the What bullets.
- Target at most 400 changed lines, excluding generated code.

## Linear

- Issues live in the Linear team printf() scanf() (key `IO`), project "Construction Risk Expert v1".
- A branch name containing `IO-<n>` and `Closes IO-<n>` in the PR body link the PR to the issue.
- Issue title = PR title without the key.
