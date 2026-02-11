# 004 Planner Schema Validation & Fallback

## Status
Proposed

## Date
2025-12-27

## Context
The planner attempts LLM-first, with rule-based fallback. Tests are stable but brittle content assertions were relaxed. We need stronger JSON schema validation of plans to prevent invalid steps without breaking stability.

## Decision
- Introduce `planSchema.ts` (Zod) under `src/brain/planning/` defining strict structure for steps (respond/tool/memory/policy), required fields, and constraints
- Validation is feature-flagged via config (default: off) to avoid immediate test impact
- On invalid plan: trigger rule-based fallback with telemetry event `planner.invalid_plan`

## Consequences
- Safer plan execution; fewer runtime surprises
- Stability maintained via feature flag until we harden tests

## References
- `vitest.config.ts` for test timeouts
- `tests/integration/cognition.e2e.test.ts`
