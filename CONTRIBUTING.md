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

## Pull requests

- Title = squash commit header + issue key: `<type>(<scope>): <summary> (IO-<n>)`.
- The title must match:
  `^(feat|fix|refactor|perf|test|docs|build|ci|chore|revert)\([a-z0-9-]+\)!?: [a-z].{3,68} \(IO-\d+\)$`
- Example: `feat(projects): add soft delete with version cascade (IO-40)`.
- Body: use the pull request template.
- Open a draft PR after the first commit.

## Merge rules

- CI green and PR title check passing.
- One approving review, from a human or a reviewer agent that did not write the code.
- Branch up to date with main.
- Squash merge only. The squash message is the PR title plus the What bullets.
- Target at most 400 changed lines, excluding generated code.

## Linear

- Issues live in the Linear team printf() scanf() (key `IO`), project "Construction Risk Expert v1".
- A branch name containing `IO-<n>` and `Closes IO-<n>` in the PR body link the PR to the issue.
- Issue title = PR title without the key.
