# AI.md — Copilot Build Rules for Vigil

⚠️ **THIS REPO IS FROZEN** until vi has a working runtime.

See [FREEZE.md](../../../FREEZE.md) for details and unfreeze milestones.

## Current Status
- **Phase:** 3 (will be active after Phase 3+ of vi)
- **Code:** Structure only, no implementation
- **Docs:** Skeleton README, no technical specs
- **Action:** Do not add features, code, or docs here

The canonical Copilot rules live in:
`tentai-docs/playbooks/copilot-rules.md`

## When This Unfreezes
Once vi has:
- Stable Chat API
- Tool system working
- Identity/auth system defined (aegis)

Then Vigil unfreezes, and you can build:
- Discord bot client setup
- Slash commands (chat, memory query, create)
- Vi-bridge (forwards Discord input to vi, returns responses)
- Moderation and permissions layer

## Important: Token Imports
For custom Discord embeds:
- **Never hardcode hex colors**
- Import design tokens from `packages/tokens/`
- Use `@tentai/tokens` package for 77EZ colors in embeds
- This ensures 77EZ is enforced even on Discord
