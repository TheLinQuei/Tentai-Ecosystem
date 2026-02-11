# Repo Structure Rules

Every Tentai repo follows the same spine:

## Docs Structure
- `/docs/00-overview` — what this repo does
- `/docs/10-architecture` — system design and decisions
- `/docs/20-modules` (or topic-specific) — individual module docs
- `/docs/30-...` (additional topics as needed)
- `/docs/90-adr` — Architecture Decision Records
- `/docs/99-archive` — obsolete docs (only with approval)

## Code Structure
- `/src` — all source code, organized by domain/responsibility
- `/tests` — unit + integration tests (mirror src structure)
- `/scripts` — utility scripts (build, deploy, maintenance)

## Root Files
- `README.md` — quick start, repo purpose, key links
- `AI.md` — copy of copilot-rules.md (for local reference)
- `.gitignore`, `package.json`/`pyproject.toml`, etc.

## Rules
- No docs outside `/docs` except `README.md` and `AI.md`.
- No random top-level files.
- Every feature includes tests + telemetry + docs.
- Use `/docs/99-archive` only when marking docs obsolete (not in active use).
