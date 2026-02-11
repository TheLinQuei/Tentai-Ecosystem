# Tentai 77EZ — Copilot Build Rules (Hard)

## 0) The End Goal
We are building **Vi**, a sovereign, modular AI system (Jarvis/Cortana/GRIOT/NATALIE-grade).
Every repo is a client or core component in the Tentai ecosystem.
All systems must be designed for long-term expansion without rewrites.

## 1) NO STUBS POLICY
- Do not create placeholder implementations, fake adapters, TODO handlers, or "return empty array" logic
  unless explicitly marked as a temporary boundary and tracked as a blocking issue.
- If a subsystem is introduced, it must be implemented to completion for its intended phase:
  tests, error handling, telemetry, and docs included.
- "Minimal" is not acceptable. "Correct and complete" is the standard.

## 2) Contracts First (vi-protocol)
- All cross-repo communication must use `vi-protocol` schemas.
- No repo may invent its own canon schema, memory record schema, citation format, or tool call format.

## 3) Quality Gates (required)
Every subsystem must ship with:
- Tests (unit + integration where applicable)
- Structured logging + telemetry events
- Strict types (no `any` except at validated boundaries)
- Clear errors (no silent failures)
- Docs in `/docs` + reference in `README`

## 4) Architecture Rules
- Separate: domain logic, storage, API, UI
- No business logic inside route handlers.
- No direct DB calls from UI components.
- Repositories must map DB → domain models and back.

## 5) Documentation Discipline (Doc Sprawl Control)
- Do not create random documentation files.
- All docs go in `/docs` using this structure:
  - /docs/00-overview
  - /docs/10-architecture
  - /docs/20-modules
  - /docs/90-adr
- Global docs belong in `tentai-docs`, not scattered across repos.

## 6) Theme Discipline (77EZ)
- UI must use the canonical Tentai tokens.
- No hardcoded hex colors outside the theme file.
- The design language is: void-black + sovereign gold + controlled cyan, with purple as an approved accent.

## 7) Approval & Canon Governance
- AI-generated canon content must be created as proposals.
- Only authorized humans can approve into canon (Kaelen, T'Kanda).
- Provenance and citations are mandatory.

## 8) Default Behavior
If uncertain:
- Stop and produce a DESIGN NOTE in `/docs/90-adr/` with tradeoffs and a recommendation.
- Then implement the recommended path fully (no half-build).

---

That makes Copilot build like it's being audited, because it is.
