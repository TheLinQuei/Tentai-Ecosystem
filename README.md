# Tentai Ecosystem: Vi

**The 77EZ Universe. Powered by Vi.**

Vi is the sovereign AI at the center. Everything else is a client.

---

## 📚 Documentation

**All documentation is in the [`docs/`](./docs/) folder.**

→ **[Start here: docs/README.md](./docs/README.md)**

Key docs:
- [docs/plans/MASTER-PLAN-77EZ.md](./docs/plans/MASTER-PLAN-77EZ.md) — 8-phase roadmap
- [docs/guides/GETTING-STARTED.md](./docs/guides/GETTING-STARTED.md) — Quick start + team assignments
- [docs/status/IMPLEMENTATION_STATUS.md](./docs/status/IMPLEMENTATION_STATUS.md) — Live tracker
- [docs/reference/](./docs/reference/) — Rules, philosophy, freeze status

---

## 🏗️ Folder Structure

```
Tentai Ecosystem/
├── docs/                      📚 ALL DOCUMENTATION (SEE THIS)
│   ├── README.md              Entry point
│   ├── index.md               Navigation
│   ├── plans/                 Roadmaps
│   ├── guides/                Getting started
│   ├── status/                Progress tracking
│   ├── reference/             Rules & philosophy
│   └── archive/               Historical docs
│
├── core/                      Where intelligence happens
│   ├── vi/                    The AI runtime
│   ├── vi-protocol/           Shared contracts
│   └── vi-sdk/                Client SDK
│
├── clients/                   User-facing applications
│   ├── command/sovereign/     Web client
│   ├── discord/vigil/         Discord bot
│   └── lore/astralis-codex/   Lore tracker
│
├── packages/                  Shared code
│   ├── tokens/                Design system
│   ├── ui/                    UI components
│   ├── telemetry/             Logging + tracing
│   └── auth-client/           Auth SDK
│
├── systems/                   Infrastructure services
│   ├── aegis/                 Identity + auth
│   └── sereph/                Hardware bridge
│
└── ops/                       Operations & infrastructure
    ├── tentai-docs/           Governance
    └── tentai-infra/          Deployment
```

---

## 🚀 Quick Start

1. **Read the roadmap:** [docs/plans/MASTER-PLAN-77EZ.md](./docs/plans/MASTER-PLAN-77EZ.md) (15 min)
2. **Find your role:** [docs/guides/GETTING-STARTED.md](./docs/guides/GETTING-STARTED.md)
3. **Check status weekly:** [docs/status/IMPLEMENTATION_STATUS.md](./docs/status/IMPLEMENTATION_STATUS.md)

---

## 📞 Questions?

See [docs/README.md](./docs/README.md) for complete documentation hub.

1. **Read the roadmap** — [Roadmap](#roadmap) below
2. **Understand the rules** — [ops/tentai-docs/playbooks/copilot-rules.md](ops/tentai-docs/playbooks/copilot-rules.md)
3. **Check the design** — [ops/tentai-docs/brand/visual.md](ops/tentai-docs/brand/visual.md)
4. **Start with Phase 0** — Lock contracts and documentation
## Where to Start

### Scenario 1: "I'm new and confused"
1. Read [QUICKSTART.md](./ops/tentai-docs/00-ecosystem/QUICKSTART.md) (5 minutes)
2. Read [STRUCTURE.md](./ops/tentai-docs/00-ecosystem/STRUCTURE.md) (15 minutes)
3. You're ready to start

### Scenario 2: "I'm building core/vi"
1. Read [core/vi/README.md](./core/vi/README.md)
2. Read [core/vi/AI.md](./core/vi/AI.md)
3. Read [copilot-rules.md](./ops/tentai-docs/playbooks/copilot-rules.md)
4. Start Phase 1 implementation

### Scenario 3: "I'm waiting for unfreeze"
1. Your repo is frozen (see [FREEZE.md](./FREEZE.md))
2. Read your repo's README.md
3. Don't add code. Wait for unfreeze.

### Scenario 4: "I need the full picture"
1. Read [HANDOFF.md](./ops/tentai-docs/00-ecosystem/HANDOFF.md) (implementation roadmap)
2. Read [DIRECTORIES.md](./ops/tentai-docs/00-ecosystem/DIRECTORIES.md) (complete tree)
3. Read [INDEX.md](./ops/tentai-docs/00-ecosystem/INDEX.md) (master index)

## What's Different Now? (Phase 0 Updates)

### Renamed for Clarity
- `core/vi-core/` → `core/vi` (this is the product, not a library)
- `vi-command-center/` → `clients/command/sovereign` (branded + categorical)
- `vibot/` → `clients/discord/vigil` (branded + categorical)

### New Organization
- **Categorical clients:** `clients/command/`, `clients/lore/`, `clients/discord/` (scales better)
- **Shared packages:** `packages/` contains tokens, ui, telemetry, auth (single source of truth)
- **Freeze policy:** Only active repos can be modified; frozen repos wait for unfreeze

### New Documentation
- **STRUCTURE.md** — Explains why the layout exists
- **QUICKSTART.md** — Get oriented in 5 minutes
- **HANDOFF.md** — Implementation roadmap
- **DIRECTORIES.md** — Complete tree + file counts
- **copilot-rules.md** — Ecosystem-wide build rules
- **AI.md files** — Repo-specific rules for 4 main repos
- **README.md files** — Entry points for core/vi, sovereign, astralis, vigil

### New Rules (copilot-rules.md)
- ✅ **No hardcoded colors.** Import from `@tentai/tokens`
- ✅ **No stubs.** Use `NotImplementedByDesign` instead
- ✅ **Freeze prevents chaos.** Frozen repos can't change
- ✅ **Contracts first.** Add schemas to vi-protocol, not scattered
- ✅ **Tests required.** Minimum 80% coverage

## The Roadmap

### Phase 0: Foundation ✅ COMPLETE
- ✅ Directory structure created and organized
- ✅ Naming reflects product intent (Vi is sovereign)
- ✅ Freeze policy established
- ✅ Design system foundation (77EZ + tokens)
- ✅ Comprehensive documentation
- ✅ Build rules documented

## Roadmap: How We Build This

### Phase 0: Lock Contracts + Brand (Foundation Week)

**Deliverables:**
- ✅ vi-protocol finalized: schemas + event envelopes + tool schema + citations + provenance
- ✅ tentai-docs created with brand and playbooks
- ✅ 77EZ design tokens (canonical CSS + JSON)

**Why first:** If you don't lock the contracts, every client drifts.


### Phase 1: Core/Vi Implementation (Active Now)
- Implement session lifecycle
- Implement memory (short-term + long-term)
- Implement tool system
- Integrate LLM provider
- Complete telemetry
- Aim for Phase 1 complete in 2-4 weeks
- When done → **Unfreeze Sovereign**

### Phase 2: Sovereign (Web UI)
- Unfreeze after Phase 1 complete
- Build web command console
- Chat interface
- Memory viewer
- Settings panel

### Phase 3: Astralis Codex (Universe Builder)
- Unfreeze after Vi Phase 2 complete
- Entity management (characters, abilities, worlds)
- Canon ledger + voting
- Consistency checking
- Import/export

### Phase 4+: Vigil (Discord Bot) + Others
- Unfreeze after auth system ready
- Discord slash commands
- Tool execution from Discord
- Canon proposals via Discord

## Status Summary

| Repo | Status | Notes |
|------|--------|-------|
| core/vi | 🔥 ACTIVE | Phase 1 implementation starts now |
| core/vi-protocol | 🔥 ACTIVE | Schemas locked, ready to use |
| core/vi-sdk | 🔥 ACTIVE | Will implement once Vi API stable |
| clients/command/sovereign | ❄️ FROZEN | Unfreezes after Vi Phase 1 |
| clients/lore/astralis-codex | ❄️ FROZEN | Unfreezes after Vi Phase 2 |
| clients/discord/vigil | ❄️ FROZEN | Unfreezes after auth system ready |
| packages/* | ✅ READY | Shared code for all projects |
| systems/aegis | ❄️ FROZEN | Unfreezes when Vi needs auth |
| systems/sereph | ❄️ FROZEN | Unfreezes when hardware integration needed |

## Essential Rules

See [copilot-rules.md](./copilot-rules.md) for complete rules. Highlights:

1. **Vi is sovereign.** All else are clients consuming from Vi.
2. **No hardcoded colors.** Use `@tentai/tokens` — 77EZ enforced everywhere.
3. **No stubs.** Throw `NotImplementedByDesign` for unready features.
4. **Contracts first.** Add schemas to vi-protocol, import elsewhere.
5. **Frozen repos stay frozen.** Don't add features until unfreeze conditions met.
6. **Tests required.** Minimum 80% coverage on critical paths.
7. **Logging matters.** Every significant action gets telemetry.

## 77EZ Design System

8 canonical colors (no hardcoding):

- **Void-Black** `#0A0E27` — Backgrounds
- **Sovereign Gold** `#D4AF37` — Primary accents
- **Controlled Cyan** `#00D9FF` — Secondary accents
- **Purple Accent** `#9D4EDD` — Highlights
- **Dark Slate** `#1A1F3A` — Dark variant
- **Silver** `#A0A8C8` — Light text
- **Deep Purple** `#7B2CBF` — Dark accent
- **Error Red** `#FF6B6B` — Errors

Use via `@tentai/tokens`:
```typescript
import { colors, spacing, typography } from '@tentai/tokens';
```

## Contributing

1. Read [QUICKSTART.md](./ops/tentai-docs/00-ecosystem/QUICKSTART.md)
2. Read [copilot-rules.md](./ops/tentai-docs/playbooks/copilot-rules.md)
3. Read your repo's `AI.md`
4. Write tests first (TDD)
5. Implement the feature
6. Commit with clear message

## Questions?

- **What's this structure for?** → [STRUCTURE.md](./ops/tentai-docs/00-ecosystem/STRUCTURE.md)
- **How do I get started?** → [QUICKSTART.md](./ops/tentai-docs/00-ecosystem/QUICKSTART.md)
- **What's the roadmap?** → [HANDOFF.md](./ops/tentai-docs/00-ecosystem/HANDOFF.md)
- **What are the rules?** → [copilot-rules.md](./ops/tentai-docs/playbooks/copilot-rules.md)
- **Is my repo frozen?** → [FREEZE.md](./FREEZE.md)
- **What's the complete tree?** → [DIRECTORIES.md](./ops/tentai-docs/00-ecosystem/DIRECTORIES.md)

## What's Next?

**Phase 1 begins now.**

Start with [QUICKSTART.md](./QUICKSTART.md) (5 min read), then move to [core/vi/README.md](./core/vi/README.md).

The structure is locked. The rules are clear. The documentation is complete.

**Build.**

---

**Phase 0 Complete** ✅

**Status:** Ready for Phase 1 implementation

**Last Updated:** 2025-01-01
- Runtime engine (sessions, turns, cancellations, telemetry)
- Memory v1 (short-term, long-term, retrieval + citations, consolidation)
- Tool system v1 (registry, safe execution, structured outputs)
- Chat API that all clients can call (text first, voice later)

**Exit condition:** Vi can run standalone, retain memory, cite sources, call tools.

### Phase 2: Command Center (Primary Interface)

**Deliverables:**
- vi-command-center UI with 77EZ theme
- Real chat interface (multi-thread conversations)
- Evidence panel (citations, provenance, tool outputs)
- Client launcher shell

**Exit condition:** You can live inside the Command Center.

### Phase 3: Astralis Codex (Universe Builder)

**Deliverables:**
- Canon ledger (proposal workflow, approvals)
- Entity modules (characters, abilities, worlds, etc.)
- Ability library + custom forge
- Import/export pipeline
- Reasoning tools (power scaling, timeline checks, contradiction checks)

**Exit condition:** Codex can be used daily and doesn't fall apart at 100+ entities.

### Phase 4: Clients Connect to Vi

**Deliverables:**
- vibot uses Vi chat + tools
- astralis-codex uses Vi for assisted creation
- aegis enforces identity + permissions across everything

**Exit condition:** One brain, multiple clients, same memory + governance.

## Key Concepts

### Contracts First (vi-protocol)
All repos use shared schemas from vi-protocol. No inventing your own memory format or tool interface.

### No Stubs Policy
Every subsystem ships complete: tests, error handling, telemetry, docs.

### 77EZ Design System
One visual language, one set of tokens. No hardcoded colors outside the theme file.

### Governance
Only Kaelen and T'Kanda can approve content into canon.

## Documentation

- **Brand & Design** → [ops/tentai-docs/brand](ops/tentai-docs/brand)
- **Build Rules** → [ops/tentai-docs/playbooks/copilot-rules.md](ops/tentai-docs/playbooks/copilot-rules.md)
- **Repo Structure** → [ops/tentai-docs/playbooks/repo-structure.md](ops/tentai-docs/playbooks/repo-structure.md)
- **Writing Guidelines** → [ops/tentai-docs/playbooks/doc-writing-rules.md](ops/tentai-docs/playbooks/doc-writing-rules.md)

## Individual Repos

| Repo | Purpose | Status |
|------|---------|--------|
| [vi-core](core/vi-core) | AI runtime engine | Phase 0 |
| [vi-protocol](core/vi-protocol) | Contracts & schemas | Phase 0 |
| [vi-sdk](core/vi-sdk) | Client libraries | Phase 0 |
| [vi-command-center](clients/vi-command-center) | Web UI | Phase 1 |
| [astralis-codex](clients/astralis-codex) | Universe builder | Phase 2 |
| [vibot](clients/vibot) | Discord bot | Phase 3 |
| [aegis](systems/aegis) | Identity & auth | Phase 3 |
| [sereph](systems/sereph) | Hardware runtime | Phase 4 |
| [tentai-infra](ops/tentai-infra) | Deployment | Ongoing |
| [tentai-docs](ops/tentai-docs) | Ecosystem docs | Ongoing |

## The 77EZ Design System

- **Void-Black** (`#0A0E27`) — Foundation, trust
- **Sovereign Gold** (`#D4AF37`) — Authority, rare
- **Controlled Cyan** (`#00D9FF`) — Precision, actionable
- **Purple Accent** (`#9D4EDD`) — Highlights, vision

See [ops/tentai-docs/brand/visual.md](ops/tentai-docs/brand/visual.md) for details.

## Next Steps

1. Explore the repo structure
2. Read [ops/tentai-docs/playbooks/copilot-rules.md](ops/tentai-docs/playbooks/copilot-rules.md)
3. Review the Phase 0 deliverables checklist
4. Pick a repo and start building
