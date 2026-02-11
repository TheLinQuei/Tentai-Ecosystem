# Canonical Paths Decision — Phase 1, Milestone 1

**Status:** LOCKED ✅  
**Effective:** December 23, 2025  
**Enforced by:** [`copilot-rules.md`](../playbooks/copilot-rules.md ) Section 10

---

## Decision Summary

At the end of Phase 1 Milestone 1, the Tentai ecosystem moved to a single canonical path per repository. Old paths were deleted entirely. No parallel versions exist.

This prevents entropy and confusion about which version is authoritative.

---

## Canonical Paths (Authoritative)

**Core (Active):**
```
✅ core/vi                    ← The brain (sovereign AI runtime)
✅ core/vi-protocol           ← Shared contracts and interfaces
✅ core/vi-sdk                ← Client SDKs
```

**Clients (Categorical, frozen until Phase 2 unfreeze):**
```
✅ clients/command/sovereign     ← Web console
✅ clients/lore/astralis-codex   ← Universe builder
✅ clients/discord/vigil         ← Discord bot
```

**Systems (Frozen):**
```
✅ systems/aegis              ← Auth service (Phase 3+)
✅ systems/sereph             ← Hardware/runtime (Phase 4+)
```

**Ops (Active governance):**
```
✅ ops/tentai-infra           ← Deployment, CI/CD
✅ ops/tentai-docs            ← Documentation hub
```

---

## Deprecated Paths (Deleted)

The following old paths were consolidated into their canonical locations and **permanently deleted**:

| Deleted Path | Canonical Path | Reason |
|--------------|----------------|--------|
| `core/vi-core` | `core/vi` | Clearer naming; Vi is a product, not a library |
| `clients/vi-command-center` | `clients/command/sovereign` | Categorical organization; scales to many clients |
| `clients/astralis-codex` | `clients/lore/astralis-codex` | Categorical organization |
| `clients/vibot` | `clients/discord/vigil` | Categorical organization; branding clarity |

**Deletion Timestamp:** December 23, 2025, Milestone 1 completion  
**Decision:** This is permanent. No rollback to old paths.

---

## Rules (Enforced)

### Rule 1: Single Authoritative Path Per Repo
- Each repository has exactly one active location
- Old paths are deleted, not archived
- All active development targets the canonical path
- No exceptions

### Rule 2: No References to Deleted Paths
- Code must never import from deleted paths
- Build tools must ignore deleted paths
- CI/CD pipelines must not reference old paths
- If discovered: fix before commit

### Rule 3: Canonical Paths are Stable
- Changing a canonical path is a breaking change
- Requires Architecture Decision Record (ADR) in [`ops/tentai-docs/90-adr/`](../90-adr/)
- Requires tech lead approval
- Requires CHANGELOG entry
- Not done casually

### Rule 4: New Repos Follow Canonical Structure
- Any new repo must use categorical structure
- `clients/` repos grouped by type (command, lore, discord, mobile, web, etc.)
- `systems/` repos grouped by service (aegis, sereph, auth, deploy, etc.)
- `core/` repos for shared infrastructure

---

## Rationale: Why This Structure?

### Why Categorical Instead of Per-Product Names?

**Old structure (by product):**
```
clients/
  ├── vi-command-center
  ├── astralis-codex
  ├── vibot
  └── (20+ more products → naming chaos)
```

**Problems:**
- Naming authority unclear
- Hard to scan ("is it `vibot` or `discord-bot` or `vigil-bot`?")
- Doesn't scale
- Type unknown from path

**New structure (by category):**
```
clients/
  ├── command/       ← Command-line, console, desktop
  │   └── sovereign
  ├── lore/         ← Universe-building tools
  │   └── astralis-codex
  ├── discord/      ← Discord integrations
  │   └── vigil
  ├── mobile/       ← Future mobile clients
  ├── web/          ← Future web clients
  └── ...
```

**Benefits:**
- Type is obvious from directory
- Scales cleanly (add `mobile/`, `web/`, `vr/`, etc.)
- Consistent naming authority
- Easy to scan

### Why Delete Instead of Archive?

**We're not at the stage where we need rollback:**
- Codebase is young (Milestone 1)
- No production deployments
- No data loss
- No customer impact

**Deletion is cleaner:**
- Removes temptation to reference old paths
- Forces all imports to use canonical paths
- Prevents "but the old version is still there" confusion
- Makes CI/CD checks trivial (no old paths to ignore)

**If rollback becomes necessary later:**
- Git history has full old code (forever)
- Can revert the commit that deleted these paths
- Clean and auditable

---

## Migration: What Was Done

**Completed:**
- ✅ Deleted `core/vi-core`
- ✅ Deleted `clients/vi-command-center`
- ✅ Deleted `clients/astralis-codex`
- ✅ Deleted `clients/vibot`
- ✅ Updated [`copilot-rules.md`](../playbooks/copilot-rules.md ) Section 10
- ✅ Created this decision document

**Remaining (if old code existed elsewhere):**
- [ ] Update all import statements to use canonical paths (if any existed)
- [ ] Update all documentation links
- [ ] Update all build/deployment scripts
- [ ] Update all GitHub Actions workflows
- [ ] Verify zero references remain in code

---

## Enforcement

### In Code Review
- Reviewer must reject any import from deleted paths
- Reviewer must ensure new repos follow categorical structure

### In CI/CD
- Pre-commit hooks can validate no deleted paths are referenced
- Build must fail if old paths are imported

### In Documentation
- All links point to canonical paths
- Old paths never mentioned except in this historical record

---

## Next Steps

1. ✅ **Paths deleted**
2. ✅ **Governance rule added** (copilot-rules.md Section 10)
3. ✅ **Decision documented** (this file)
4. → **Proceed to Step 2: Documentation Cleanup**

---

**This decision is final and locked.**

**Go forth. Build on solid canonical ground.**
