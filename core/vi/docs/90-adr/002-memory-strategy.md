# 002 Memory Strategy: Retrieval, Persistence, Consolidation & Citations

## Status
Proposed

## Date
2025-12-27

## Context
Memory retrieval before response and persistence after reflection are wired. Consolidation and citation formatting are pending and must observe Boundary Policy. We need deterministic consolidation, clear citation schema (vi-protocol), and retrieval tuning without breaking tests.

## Decision
- Add `consolidateMemories()` boundary module (`src/brain/memory/consolidation.ts`) that throws `NotImplementedByDesign` with Phase 2 context; do not wire into the pipeline yet to avoid test breakage.
- Define citation schema in `vi-protocol` before usage (fields: `source`, `type`, `confidence`, `snippet`, `id`)
- Retrieval tuning:
  - Introduce configurable K/top-p thresholds and recency weighting; leave defaults unchanged
- Audit fields:
  - Memory records include `created_at`, `source`, `confidence`, `session_id`

## Consequences
- Deterministic failure if consolidation is invoked prematurely
- Clear path to adopt citations without ad-hoc formats
- Retrieval tuning is safe behind config; stability preserved

## References
- `ops/tentai-docs/playbooks/copilot-rules.md`
- `core/vi/docs/30-memory/` for module documentation
- `vi-protocol` for schemas
