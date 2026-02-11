# AI.md — Copilot Build Rules for sereph

⚠️ **THIS REPO IS FROZEN** until vi-core is fully mature.

See [FREEZE.md](../../FREEZE.md) for details and unfreeze milestones.

## Current Status
- **Phase:** 4+ (will be active late in the roadmap)
- **Code:** Structure only, no implementation
- **Docs:** Skeleton README, no technical specs
- **Action:** Do not add features, code, or docs here

The canonical Copilot rules live in:
`tentai-docs/playbooks/copilot-rules.md`

## When This Unfreezes
Once:
- vi-core is proven, stable, and production-ready
- All core clients (command-center, codex, vibot) are working
- Your hardware requirements are fully defined
- Vi-sdk is mature and well-tested

Then sereph unfreezes, and you can build:
- Hardware runtime integration
- Vi bridge (calls vi-sdk, receives responses)
- Async event loop
- Hardware-specific adapters
