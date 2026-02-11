# FREEZE: Repository Dormancy Until Vi Exists

**Effective immediately.**

## The Decision

Until **Vi (vi-core) exists as a working runtime**, all other repositories are **frozen**.

This means:

- ✋ **No new code**
- ✋ **No new docs (except this one and governance)**
- ✋ **No "nice to have" features**
- ✋ **No design decisions**

## Which Repos Are Frozen

| Repo | Status | Reason |
|------|--------|--------|
| vi-core | 🔥 **ACTIVE** | The brain. Everything depends on this. |
| vi-protocol | 🔥 **ACTIVE** | Contracts. Refine as vi-core needs them. |
| sovereign | 🔥 **ACTIVE** (unfrozen 2025-12-27) | Chat UI for manual testing of Vi. Phase 1.1 complete. |
| astralis-codex | ❄️ Frozen | Waits for entity schemas + vi-core Phase 2 |
| vigil | ❄️ Frozen | Waits for vi-core SDK + Discord bridge (Phase 2) |
| aegis | ❄️ Frozen | Waits for vi-core to define what needs auth (Phase 3) |
| sereph | ❄️ Frozen | Waits for vi-core integration points (Phase 4+) |
| tentai-infra | ❄️ Frozen | Waits for vi-core deployment requirements |
| tentai-docs | 🔄 Governance Only | Brand + rules + playbooks, no tech specs |

## What "Frozen" Means

**Frozen repos:**
- Have structure (folders exist)
- Have skeleton READMEs (purpose, phase, dependencies)
- Are **not being built**
- Do not get new code or detailed docs

**You literally don't touch them until vi-core reaches a milestone.**

## Why?

**The Problem:** Building seven clients for a brain that doesn't exist yet = fantasy sprawl.
- You end up with beautiful UI mockups for APIs that don't work
- You design data models that won't fit the memory schema
- You build Discord integrations before the bridge even exists
- Result: Rework, frustration, wasted effort

**The Solution:** Focus. Build the brain first. Clients follow.

## When Do They Unfreeze?

### Unfreeze Tier 1.1 (after M9 of vi-core) ✅ COMPLETE
**Trigger:** Vi-core has working Chat API (`POST /v1/chat`)

**Unfrozen:**
- sovereign (web console with chat UI for manual testing)

**Rationale:** Enables humans to interact with Vi without terminals.

### Unfreeze Tier 2 (after Phase 1 of vi-core)
**Trigger:** Vi-core has stable auth, sessions, memory (short + long term), tools, and proven reliability

**Will Unfreeze:**
- vi-sdk (build the SDK for clients to use)
- astralis-codex (universe builder client)

### Unfreeze Tier 2 (after Phase 2 of vi-core)
**Trigger:** Vi-core has cognition pipeline and evidence trails

**Unfreeze:**
- vi-command-center (build the primary UI)

### Unfreeze Tier 3 (after Phase 3 of vi-core)
**Trigger:** Vi-core is proven, stable, and authority system is clear

**Unfreeze:**
- astralis-codex (entity models + canon ledger)
- vibot (Discord bot client)
- aegis (identity + auth enforced)

### Unfreeze Tier 4 (after Phase 4+)
**Trigger:** Everything else is working

**Unfreeze:**
- sereph (hardware integration)
- tentai-infra (deployment + scaling)

## Governance Documents (Not Frozen)

The following docs in **tentai-docs** remain active (they set the rules):

- `brand/` — 77EZ tokens (locked, not changing)
- `playbooks/` — How we build, Copilot rules, repo structure (can be refined)
- `adr/` — Ecosystem-level decisions (cross-repo decisions only)

**No technical specs for frozen repos** in tentai-docs until they unfreeze.

## For Copilot / AI

If asked to:
- "Add a feature to vibot" → **No.** Vibot is frozen.
- "Improve the Codex UI" → **No.** Codex is frozen.
- "Document the aegis API" → **No.** Aegis is frozen until we know what it needs to protect.
- "Create tests for vi-command-center" → **No.** Command Center is frozen.

**Always ask:** Is this repo active or frozen? If frozen, refer back to this decision.

## Exception: Critical Bugs

If a frozen repo has a **breaking issue in its structure** (like wrong folder paths), fix it. But don't add features or docs.

---

**This freeze is not punishment. It's focus.**

Build one thing well. Everything else follows.
