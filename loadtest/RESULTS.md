# Load test results (IO-78, NFR-04: p95 < 1 s)

## Setup

- Stack: `deploy/compose/compose.yaml` with `--scale api=2` (Caddy balances
  the two replicas by DNS), one worker, Postgres 16, Valkey, RustFS,
  Gotenberg. The `web` service is not started.
- Host: 2 vCPU (i7-9750H), 3.8 GB RAM. k6 (`grafana/k6:1.4.2`), the stack
  and other containers shared this one machine, so these numbers are
  conservative.
- Data set (`seed.sql`): 500 users x 10 projects x 5 versions (25 000
  versions, 1.375 M answers, 1.1 M stored results). Versions 1-4 are
  submitted, version 5 is a draft with all 55 indicators answered.
- Load: 100 concurrent virtual users for 3 minutes, one k6 scenario per
  endpoint, 1 s think time (2 s after submit and report):

  | Scenario | VUs | What one iteration does |
  | --- | --- | --- |
  | login | 10 | `POST /auth/login` (Argon2id verify) |
  | dashboard | 20 | `GET /dashboard` |
  | projects | 20 | `GET /projects?page=1&page_size=10` |
  | answers | 20 | `PATCH .../answers` with 5 indicators |
  | submit | 5 | `PATCH .../answers` with 55 indicators, then `POST .../submit` |
  | results | 20 | `GET .../results` (stored results, 55 rows) |
  | report | 5 | `POST .../reports`, then `GET /jobs/{id}` |

- Log in and report request limits are lifted for the run
  (`compose.loadtest.yaml`) because all traffic comes from one IP.
- Run (IO-113 branch, first run): 20 727 requests, 113.9 requests/s, 0 failed.

## Results (re-run on main, 2026-11-25, commit c335206)

Same setup, data set, load and host as above, with the api and worker built
from `main` (all routes mounted; IO-113 is merged). 3 minute run, 2 api
replicas: 21 474 requests, 118.1 requests/s, 0 failed.

| Endpoint | Requests | p50 (ms) | p95 (ms) | p99 (ms) | p95 < 1 s |
| --- | ---: | ---: | ---: | ---: | :---: |
| `POST /auth/login` | 1597 | 89 | 207 | 409 | pass |
| `GET /dashboard` | 3448 | 11 | 76 | 196 | pass |
| `GET /projects` | 3485 | 5 | 43 | 83 | pass |
| `PATCH .../answers` (5 indicators) | 3397 | 21 | 122 | 203 | pass |
| `PATCH .../answers` (55 indicators) | 390 | 124 | 366 | 475 | pass |
| `POST .../submit` (55 indicators) | 390 | 88 | 253 | 350 | pass |
| `GET .../results` | 3445 | 10 | 75 | 188 | pass |
| `POST .../reports` | 434 | 9 | 78 | 190 | pass |
| `GET /jobs/{id}` | 434 | 3 | 24 | 63 | pass |

Every endpoint is under 1 s at p95 (NFR-04). The numbers are a little lower
than the IO-113 run; both runs share one busy 2 vCPU host, so treat the
difference as noise rather than a gain.

## Earlier results (3 min run, api built from the IO-113 branch, commit 95fc8d5)

| Endpoint | Requests | p50 (ms) | p95 (ms) | p99 (ms) | p95 < 1 s |
| --- | ---: | ---: | ---: | ---: | :---: |
| `POST /auth/login` | 1523 | 114 | 289 | 791 | pass |
| `GET /dashboard` | 3315 | 13 | 102 | 262 | pass |
| `GET /projects` | 3374 | 6 | 55 | 114 | pass |
| `PATCH .../answers` (5 indicators) | 3282 | 26 | 161 | 274 | pass |
| `PATCH .../answers` (55 indicators) | 372 | 180 | 450 | 750 | pass |
| `POST .../submit` (55 indicators) | 372 | 103 | 307 | 562 | pass |
| `GET .../results` | 3335 | 12 | 94 | 256 | pass |
| `POST .../reports` | 424 | 13 | 104 | 199 | pass |
| `GET /jobs/{id}` | 424 | 4 | 54 | 150 | pass |

Every interactive endpoint is under 1 s at p95. Report requests answer 202
in about 100 ms at p95 while Gotenberg runs at about 190 % CPU, so reports
do not block requests.

## Notes

- Pending mount: on `main` at the time of the run, the versions, answers,
  submit, results and reports routes returned 404 (IO-113, PR #100, is
  not merged). The dashboard and project list were already served. The
  table above comes from the api and worker built from the IO-113 branch
  with the same compose file. Re-run on `main` after IO-113 merged: see the 2026-11-25 table above.
- Report jobs fail in this stack with "The specified bucket does not exist":
  nothing creates the `cre` bucket in RustFS. This does not affect the
  request path measured here, but report downloads need that bucket.
- The first login of each VU is the slowest request (max 7 s) while the
  Argon2id hashing queues on 2 cores; p95 stays under 300 ms.

## Reproduce

```
loadtest/run.sh up      # build, start 2 api replicas, seed (about 15 min on 2 vCPU)
loadtest/run.sh test    # DURATION=3m; summary also in loadtest/out/summary.json
loadtest/run.sh down    # stop, delete volumes, images and the k6 image
```

Set `COMPOSE_YAML` to use a compose file from another checkout.
