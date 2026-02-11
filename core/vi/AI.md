# AI.md — Copilot Build Rules for vi

This file is a local reference. The canonical version lives in:
`tentai-docs/playbooks/copilot-rules.md`

## Quick Rules for This Repo
- **This is the product, not a library.** Core/vi is where Vi lives.
- **No stubs.** If you introduce a subsystem, implement it fully (tests, errors, telemetry, docs).
- **Use vi-protocol contracts.** All memory formats, event schemas, and tool interfaces come from `vi-protocol`.
- **Strict types.** No `any` except at validated boundaries.
- **Logs matter.** Every significant action gets a structured log or telemetry event.
- **Tests required.** Unit + integration for new features.
- **Docs in `/docs`.** Structure: `00-overview`, `10-architecture`, `20-modules`, `30-memory`, `40-tools`, `90-adr`.

## vi (core/vi) Specifics
- **Domain separation:** runtime ≠ cognition ≠ memory ≠ tools
- **Session lifecycle:** clear start, context packing, cancellation, cleanup
- **Memory contracts:** short-term (session), long-term (persistent), retrieval (RAG + citations), consolidation (pruning/merging)
- **Tool execution:** safe, with retries and guardrails
- **No hardcoded LLM prompts.** Cognition modules should be testable, not wrapped in magic strings.

## When Uncertain
Create an ADR in `/docs/90-adr/` with:
- Context: why do we need to decide this?
- Decision: what did we choose?
- Consequences: what are the tradeoffs?

Then implement the chosen path fully.
