# AI.md — Copilot Build Rules for vi-sdk

This file is a local reference. The canonical version lives in:
`tentai-docs/playbooks/copilot-rules.md`

## Quick Rules for This Repo
- **No stubs.** If you introduce a subsystem, implement it fully (tests, errors, telemetry, docs).
- **Use vi-protocol contracts.** All schemas come from `vi-protocol`.
- **Strict types.** TypeScript for TS/Node, no `any` except at validated boundaries.
- **Client-first design.** SDKs make it easy for vi-command-center, vibot, and astralis-codex to talk to vi-core.
- **Tests required.** Unit + integration for new features.
- **Docs in `/docs`.** Structure: `00-overview`, `10-architecture`, `90-adr`.

## vi-sdk Specifics
- **TypeScript SDK first.** Node.js wrapper around vi-core runtime API.
- **Clean abstractions.** Hide vi-core complexity behind simple, documented APIs.
- **Error handling.** Structured errors with clear messages for clients.
- **Async/await focused.** All network calls are async.

## When Uncertain
Create an ADR in `/docs/90-adr/` with context, decision, and consequences.
