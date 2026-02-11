# AI.md — Copilot Build Rules for Sovereign

⚠️ **THIS REPO IS FROZEN** until vi has a working runtime.

See [FREEZE.md](../../../FREEZE.md) for details and unfreeze milestones.

## Current Status
- **Phase:** 1 (will be active after Phase 1 of vi)
- **Code:** Structure only, no implementation
- **Docs:** Skeleton README, no technical specs
- **Action:** Do not add features, code, or docs here

The canonical Copilot rules live in:
`tentai-docs/playbooks/copilot-rules.md`

## When This Unfreezes
Once vi (core/vi) has:
- Sessions and turn management
- Memory (short-term + long-term)
- Tool system
- Working Chat API

Then Sovereign unfreezes, and you can build:
- 77EZ-themed UI shell
- Chat interface
- Evidence panel (citations, provenance)
- Service layer integration with vi

## Important: Token Imports
When Sovereign unfreezes and development begins:
- **Never hardcode hex colors**
- Import design tokens from `packages/tokens/`
- Use `@tentai/tokens` package for all colors, spacing, typography
- This ensures 77EZ is enforced everywhere
