# Master Index — Tentai Ecosystem Phase 0

**Status:** ✅ Phase 0 Complete — Ready for Phase 1

This file lists every documentation file created and where to find it.

---

## Root Level Documents (Must Read)

### Quick Start (5 minutes)
- **[QUICKSTART.md](./QUICKSTART.md)** — Get oriented in 5 minutes. Read this first.

### Architecture & Philosophy
- **[STRUCTURE.md](./STRUCTURE.md)** — Why the layout exists. Explains rationale and scaling rules.
- **[vi.md](./vi.md)** — Declaration that Vi is sovereign.
- **[DIRECTORIES.md](./DIRECTORIES.md)** — Complete tree structure with all directories.

### Governance
- **[FREEZE.md](./FREEZE.md)** — Freeze policy. What's frozen and why. Unfreeze conditions.
- **[copilot-rules.md](./copilot-rules.md)** — Ecosystem-wide build rules. No colors, no stubs, tests required.
- **[UNIMPLEMENTED_BY_DESIGN.md](./UNIMPLEMENTED_BY_DESIGN.md)** — Definition of NotImplementedByDesign pattern.

### Implementation Planning
- **[HANDOFF.md](./HANDOFF.md)** — Roadmap and next steps. What to do after Phase 0.
- **[PHASE0_COMPLETE.md](./PHASE0_COMPLETE.md)** — Summary of what was delivered in Phase 0.
- **[PROJECT_COMPLETION_REPORT.md](./PROJECT_COMPLETION_REPORT.md)** — Executive summary of phase completion.

### Overview
- **[README.md](./README.md)** — Root entry point. Links to all docs and quick status.

---

## Core Repositories (Active 🔥)

### core/vi — The AI Runtime

**[core/vi/README.md](./core/vi/README.md)**
- What Vi does (runtime, cognition, memory, tools)
- Architecture overview
- Phase 1 implementation plan
- How to contribute

**[core/vi/AI.md](./core/vi/AI.md)**
- Copilot build rules for this repo
- Domain separation (runtime, cognition, memory, tools)
- When to use TDD, logging, tests
- Reference to copilot-rules.md

### core/vi-protocol — Shared Contracts

**[core/vi-protocol/README.md](./core/vi-protocol/README.md)**
- Purpose: source of truth for schemas
- Structure: schema/, events/, governance/
- What goes here vs what doesn't
- Usage examples

**[core/vi-protocol/AI.md](./core/vi-protocol/AI.md)**
- Build rules for this repo
- Contract-first approach
- No implementation, just specs

### core/vi-sdk — Client SDK

**[core/vi-sdk/README.md](./core/vi-sdk/README.md)**
- Purpose: how clients talk to Vi
- Structure: ChatClient, MemoryClient, ToolClient
- When this unfreezes (Phase 1 Vi API stable)

**[core/vi-sdk/AI.md](./core/vi-sdk/AI.md)**
- Build rules for this repo
- API design first
- Freeze status and conditions

---

## Frozen Client Repos (❄️)

### clients/command/sovereign — Web Command Console

**[clients/command/sovereign/README.md](./clients/command/sovereign/README.md)**
- What Sovereign does (chat, memory, tools, settings)
- Architecture (app, components, pages, services, state)
- Key screens (Chat, Memory, Tools, Settings, Dashboard)
- Freeze status: ❄️ Frozen until Vi Phase 1 complete
- Unfreeze conditions listed

**[clients/command/sovereign/AI.md](./clients/command/sovereign/AI.md)**
- Build rules for this repo (when unfrozen)
- Freeze status and conditions
- Token import requirement

### clients/lore/astralis-codex — Universe Builder

**[clients/lore/astralis-codex/README.md](./clients/lore/astralis-codex/README.md)**
- What Astralis does (entities, canon ledger, reasoning)
- Architecture (domain, canon, reasoning, storage, ui, import_export)
- Key concepts (entities, canon ledger, consistency engine)
- Freeze status: ❄️ Frozen until Vi Phase 2 complete

**[clients/lore/astralis-codex/AI.md](./clients/lore/astralis-codex/AI.md)**
- Build rules for this repo (when unfrozen)
- Freeze status and conditions
- Token import requirement

### clients/discord/vigil — Discord Bot

**[clients/discord/vigil/README.md](./clients/discord/vigil/README.md)**
- What Vigil does (chat interface, canon interface, tools, moderation)
- Architecture (bot, vi bridge, storage, commands, events)
- Key commands (/chat, /memory, /propose, /tool)
- Freeze status: ❄️ Frozen until auth defined and Vi API stable

**[clients/discord/vigil/AI.md](./clients/discord/vigil/AI.md)**
- Build rules for this repo (when unfrozen)
- Freeze status and conditions
- Token import requirement for Discord embeds

---

## Shared Packages (✅ Ready)

### packages/tokens — Design System (77EZ)

**[packages/tokens/README.md](./packages/tokens/README.md)**
- Purpose: single source of truth for 77EZ colors
- 8 canonical colors: void-black, sovereign gold, controlled cyan, etc.
- Usage: import from @tentai/tokens, never hardcode
- Why: consistency across all clients
- Later: publish to npm

### packages/ui — UI Components

**[packages/ui/README.md](./packages/ui/README.md)**
- Purpose: reusable UI components
- Components: Button, Panel, Modal, HUD, CitationBadge, ProvenancePanel
- Usage: import from @tentai/ui
- Design: all use tokens, no hardcoding
- Phase: stubs now, full implementation when clients unfreeze

### packages/telemetry — Logging & Tracing

**[packages/telemetry/README.md](./packages/telemetry/README.md)**
- Purpose: structured logging, tracing, metrics
- Usage: Logger, Tracer classes
- Output: console (dev), JSON (prod)
- Used by: all services

### packages/auth-client — Aegis SDK Stub

**[packages/auth-client/README.md](./packages/auth-client/README.md)**
- Purpose: Aegis client for identity + auth
- Phase 0: stub with NotImplementedByDesign
- Usage: import AegisClient, getCurrentUser(), hasPermission()
- Unfreeze: Phase 4 when Aegis defined

---

## Frozen Systems (❄️)

### systems/aegis — Identity + Auth

**[systems/aegis/README.md](./systems/aegis/README.md)**
- Purpose: user management, permissions, JWT tokens
- Status: ❄️ Frozen until needed

**[systems/aegis/AI.md](./systems/aegis/AI.md)**
- Freeze status and unfreeze conditions

### systems/sereph — Hardware Bridge

**[systems/sereph/README.md](./systems/sereph/README.md)**
- Purpose: hardware/runtime integration
- Status: ❄️ Frozen until Vi mature

**[systems/sereph/AI.md](./systems/sereph/AI.md)**
- Freeze status and unfreeze conditions

---

## Operations (🔄 Governance)

### ops/tentai-docs — Brand & Specs

**[ops/tentai-docs/brand/visual.md](./ops/tentai-docs/brand/visual.md)**
- 77EZ visual identity
- Design principles

**[ops/tentai-docs/brand/tokens.json](./ops/tentai-docs/brand/tokens.json)**
- Canonical token values

**[ops/tentai-docs/brand/tokens.css](./ops/tentai-docs/brand/tokens.css)**
- CSS variables for tokens

**[ops/tentai-docs/playbooks/copilot-rules.md](./ops/tentai-docs/playbooks/copilot-rules.md)**
- Master copy of ecosystem rules (same as root/copilot-rules.md)

### Verification & Control
- **[MILESTONE_VERIFICATION.md](./MILESTONE_VERIFICATION.md)** — Fresh checkout verification, Windows commands, port overrides.
- **[TEST_MODE.md](./TEST_MODE.md)** — Deterministic proofs without providers.
- **[GOD_CONSOLE.md](./GOD_CONSOLE.md)** — Requirements for the operational cockpit.

### ops/tentai-infra — Deployment

**[ops/tentai-infra/README.md](./ops/tentai-infra/README.md)**
- Purpose: Docker, K8s, Terraform, CI/CD
- Status: ❄️ Frozen until services stabilize

---

## Document Map (By Purpose)

### If You Need To Know...

| Question | Document |
|----------|----------|
| How do I start? | [QUICKSTART.md](./QUICKSTART.md) |
| Why is this layout? | [STRUCTURE.md](./STRUCTURE.md) |
| What's frozen? | [FREEZE.md](./FREEZE.md) |
| What are the rules? | [copilot-rules.md](./copilot-rules.md) |
| What's the complete tree? | [DIRECTORIES.md](./DIRECTORIES.md) |
| What was delivered? | [PHASE0_COMPLETE.md](./PHASE0_COMPLETE.md) |
| What's next? | [HANDOFF.md](./HANDOFF.md) |
| How do I build Vi? | [core/vi/README.md](./core/vi/README.md) |
| How do I build Sovereign? | [clients/command/sovereign/README.md](./clients/command/sovereign/README.md) |
| What's the design system? | [packages/tokens/README.md](./packages/tokens/README.md) |
| What's my repo's status? | Check your repo's AI.md |
| Is there a boundary pattern? | [UNIMPLEMENTED_BY_DESIGN.md](./UNIMPLEMENTED_BY_DESIGN.md) |
| What's the philosophy? | [vi.md](./vi.md) |

---

## Reading Order (Recommended)

### First Time (30 minutes)
1. [QUICKSTART.md](./QUICKSTART.md) — 5 min
2. [STRUCTURE.md](./STRUCTURE.md) — 15 min
3. [README.md](./README.md) — 5 min
4. You're ready to start

### Before Writing Code (45 minutes)
1. [QUICKSTART.md](./QUICKSTART.md) — 5 min
2. Your repo's README.md (e.g., [core/vi/README.md](./core/vi/README.md)) — 10 min
3. Your repo's AI.md (e.g., [core/vi/AI.md](./core/vi/AI.md)) — 10 min
4. [copilot-rules.md](./copilot-rules.md) — 15 min
5. Check [FREEZE.md](./FREEZE.md) if your repo is frozen — 5 min

### Deep Dive (2 hours)
1. [STRUCTURE.md](./STRUCTURE.md) — 30 min
2. [HANDOFF.md](./HANDOFF.md) — 15 min
3. [DIRECTORIES.md](./DIRECTORIES.md) — 15 min
4. [copilot-rules.md](./copilot-rules.md) — 30 min
5. Your repo's README + AI.md — 20 min
6. [PHASE0_COMPLETE.md](./PHASE0_COMPLETE.md) — 10 min

---

## Document Statistics

**Total Documents:** 22
- Root level: 9 files
- Core repos: 4 files (vi, protocol, sdk, plus root)
- Client repos: 6 files (sovereign, astralis, vigil)
- Packages: 4 files (tokens, ui, telemetry, auth)
- Systems: 2 files (aegis, sereph)
- Ops: 2 files (docs, infra)

**Total Lines:** ~5,000+ lines of documentation

**Total Words:** ~50,000+ words

---

## What Each Doc Does

| Document | Lines | Purpose | Audience |
|----------|-------|---------|----------|
| QUICKSTART.md | 150 | 5-min orientation | Everyone |
| STRUCTURE.md | 350 | Why layout exists | Architects |
| HANDOFF.md | 200 | Implementation roadmap | Developers |
| DIRECTORIES.md | 300 | Complete tree | Reference |
| copilot-rules.md | 350 | Build rules | Developers |
| core/vi/README.md | 150 | Vi overview | Vi developers |
| clients/command/sovereign/README.md | 120 | Sovereign overview | Web developers |
| clients/lore/astralis-codex/README.md | 120 | Astralis overview | Backend developers |
| clients/discord/vigil/README.md | 120 | Vigil overview | Bot developers |
| packages/tokens/README.md | 80 | Design tokens | UI developers |
| packages/ui/README.md | 90 | UI components | UI developers |
| packages/telemetry/README.md | 80 | Logging | All developers |
| packages/auth-client/README.md | 60 | Auth stub | All developers |

---

## Next Action

**Read [QUICKSTART.md](./QUICKSTART.md) right now. It's 5 minutes.**

Then proceed to Phase 1 implementation.

---

**Master Index Version:** 1.0  
**Last Updated:** 2025-01-01  
**Phase:** 0 (Complete)
