# CRE design specs

The current specs are the source of truth for every issue. Each Linear issue's **Spec references** section names the parts to read; read only those.

| Spec | Version | Read | Source files | Decides |
| --- | --- | --- | --- | --- |
| Requirements & use cases | v1.15 | [requirements/cre-requirements-usecase.pdf](requirements/cre-requirements-usecase.pdf) | `cre-requirements-usecase.tex`, `cre-usecase.drawio`, `cre-usecase-diagram.pdf` | Scope: UC-01–UC-21, FR-01–FR-57, BR rules, NFR-01–NFR-12 |
| Risk engine & indicators | v1.1 | [risk-engine/cre-risk-engine-and-indicators-v1.1.pdf](risk-engine/cre-risk-engine-and-indicators-v1.1.pdf) | `.tex`, `cre-indicators.json`, `cre-indicators.csv`, `cre-advice.csv` | Scoring (RL, RI_C, RI_T, RI_E, RM, level), 55 indicators, thresholds, advice |
| Architecture | v2.3 (decisions v2.15) | [architecture/cre-architecture-decisions.md](architecture/cre-architecture-decisions.md) | `cre-architecture-v2.3.pdf` / `.docx`, `.drawio`, `.png` | Stack, networks, sessions, jobs, backup, deployment |
| Database design | v1 (schema v1.1) | [database/cre-database-design-v1.pdf](database/cre-database-design-v1.pdf) | `.tex`, `cre-er-diagram-v1.drawio`, `figures/` | 29 tables, keys, checks, indexes, write paths |
| UX/UI | wireframes + hi-fi | [ux-ui/CRE-hifi-ui.drawio](ux-ui/CRE-hifi-ui.drawio) | `CRE-wireframes.drawio` | Screens per page: 00 Foundations, 01 Components, 1–5 |
| User flow | — | [user-flow/cre-userflow.drawio](user-flow/cre-userflow.drawio) | — | Navigation between screens |

`.drawio` files are plain XML: each `<diagram name="…">` is one page (the hi-fi file has 9). Open them in draw.io / diagrams.net, or read the XML directly.

## Rules

- Only the current version of each spec lives here. Older versions stay out of the repo.
- If specs disagree with each other or with an issue, label the Linear issue `needs-decision` and stop.
- A spec change is its own PR (`docs(repo): …`), never part of a feature PR.
- `backend/seed/` holds the copy of `cre-indicators.json`, `cre-indicators.csv` and `cre-advice.csv` that the app loads. When the risk-engine seed files change here, update `backend/seed/` in the same PR.
