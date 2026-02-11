# AI.md — Copilot Build Rules for aegis

⚠️ **THIS REPO IS FROZEN** until vi-core defines what needs authorization.

See [FREEZE.md](../../FREEZE.md) for details and unfreeze milestones.

## Current Status
- **Phase:** 3 (will be active after vi-core stabilizes)
- **Code:** Structure only, no implementation
- **Docs:** Skeleton README, no technical specs
- **Action:** Do not add features, code, or docs here

The canonical Copilot rules live in:
`tentai-docs/playbooks/copilot-rules.md`

## When This Unfreezes
Once vi-core has:
- Tool system (what needs auth?)
- Memory access patterns (what's sensitive?)
- User model defined

And governance roles are clear:
- What can Kaelen do?
- What can T'Kanda do?
- What can regular users do?

Then aegis unfreezes, and you can build:
- Identity service (user/system identity)
- Authorization layer (role-based, fine-grained)
- Audit log (all changes tracked)
