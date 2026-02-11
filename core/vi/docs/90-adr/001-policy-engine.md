# 001 Policy Engine Architecture

## Status
Proposed

## Date
2025-12-27

## Context
Vi’s current `StubPolicyEngine` allows all operations. Per Copilot Build Rules (77EZ), we need clear governance: permissions, content safety, and enforcement hooks. This must follow the Boundary Policy (fail loudly via `NotImplementedByDesign`) and never place business logic in route handlers.

## Decision
- Define `PolicyEngine` interface in core/vi (`src/brain/policy/PolicyEngine.ts`) with:
  - `evaluate(requestContext, plannedStep): PolicyDecision`
  - `enforce(decision): void` (may throw)
- Enforcement points:
  - Before tool calls, memory access, and respond steps (executor-level)
  - Server-layer preflight guards (Fastify hook) only for coarse rate/role checks; no business logic in routes
- Default behavior:
  - If a rule is not implemented, do not silently allow; return a `NotImplementedByDesign` error with phase context and workaround (e.g., disable the feature or require admin override)
- Config-driven:
  - Externalize policy config under `config/policy/` (YAML/JSON), loaded at startup; environment-selectable profiles
- Telemetry:
  - Emit structured events for every denial and override with reason codes

## Consequences
- Clear, testable enforcement surfaces in executor/server
- Some flows may fail loudly until rules are implemented; mitigated by opt-in features and profiles
- Enables future audit trails and compliance reporting

## References
- `ops/tentai-docs/playbooks/copilot-rules.md`
- Boundary Policy: `UNIMPLEMENTED_BY_DESIGN.md`
- Server wiring: `src/runtime/server.ts` (preflight hooks)
