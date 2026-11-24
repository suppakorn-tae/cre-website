Closes IO-<n>

## What
- 1–5 bullets: the observable change

## Why
One or two sentences; link the spec (UC/FR/BR, AD).

## How to verify
1. make up && make test-<area>
2. <request / page / expected result>

## Contract or schema change
None | contracts/openapi/paths/x.yaml | migrations/2026…_x.sql

## Checklist
- [ ] Only owned paths changed
- [ ] Tests added and passing
- [ ] make gen clean (no stale generated code)
- [ ] No spec codes or English-only strings in user-facing text
