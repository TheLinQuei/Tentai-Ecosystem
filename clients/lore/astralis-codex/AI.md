# AI.md — Copilot Build Rules for Astralis Codex

⚠️ **THIS REPO IS FROZEN** until vi has a working runtime AND entity contracts are locked.

See [FREEZE.md](../../../FREEZE.md) for details and unfreeze milestones.

## Current Status
- **Phase:** 2-3 (will be active after Phase 2 of vi)
- **Code:** Structure only, no implementation
- **Docs:** Skeleton README, no technical specs
- **Action:** Do not add features, code, or docs here

The canonical Copilot rules live in:
`tentai-docs/playbooks/copilot-rules.md`

## When This Unfreezes
Once vi has:
- Cognition pipeline (reasoning)
- Evidence trails and citations
- Stable API contracts

And vi-protocol has:
- Locked entity schemas (Character, Ability, World, etc.)
- Canon ledger contracts

Then Astralis Codex unfreezes, and you can build:
- Entity repositories (domain logic)
- Canon ledger (proposals, approvals, provenance)
- Reasoning engine (power scaling, timeline checks, contradiction checks)
- Import/export adapters

## Important: Token Imports
When development begins:
- **Never hardcode hex colors**
- Import design tokens from `packages/tokens/`
- Use `@tentai/tokens` package for all UI colors
- This ensures 77EZ is enforced everywhere
