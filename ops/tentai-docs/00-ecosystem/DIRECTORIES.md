# Tentai Ecosystem — Complete Directory Structure

This is the complete, final structure of the Tentai Ecosystem as of Phase 0.

---

## Root Level

```
tentai-ecosystem/
├── core/                      # Where intelligence happens
├── clients/                   # User-facing applications
├── packages/                  # Shared code libraries
├── systems/                   # Infrastructure services
├── ops/                       # Operations and documentation
│
├── README.md                  # Root overview
├── STRUCTURE.md               # Explains why the structure exists
├── QUICKSTART.md              # Developer quick start (5 minutes)
├── HANDOFF.md                 # Implementation roadmap
├── FREEZE.md                  # Governance: what's frozen and why
├── vi.md                      # Declaration: Vi is sovereign
├── copilot-rules.md           # Ecosystem-wide build rules
├── UNIMPLEMENTED_BY_DESIGN.md # Boundary pattern definition
│
├── .gitignore
├── package.json               # Root workspace (monorepo)
└── tsconfig.base.json         # Base TypeScript config
```

---

## core/ — The Intelligence

```
core/
│
├── vi/                        🔥 ACTIVE - The AI runtime
│   ├── src/
│   │   ├── runtime/           # Engine, sessions, telemetry
│   │   │   ├── engine.ts
│   │   │   ├── session.ts
│   │   │   └── telemetry.ts
│   │   ├── cognition/         # Perception, intent, planning, reasoning, response
│   │   │   ├── perception.ts
│   │   │   ├── intent.ts
│   │   │   ├── planning.ts
│   │   │   ├── reasoning.ts
│   │   │   └── response.ts
│   │   ├── memory/            # Short-term, long-term, retrieval, consolidation
│   │   │   ├── contracts.ts
│   │   │   ├── short_term.ts
│   │   │   ├── long_term.ts
│   │   │   ├── retrieval.ts
│   │   │   └── consolidation.ts
│   │   ├── identity/          # User profiles, policy
│   │   │   ├── user.ts
│   │   │   └── policy.ts
│   │   ├── tools/             # Tool registry, execution, guardrails
│   │   │   ├── registry.ts
│   │   │   ├── executor.ts
│   │   │   └── guardrails.ts
│   │   ├── integrations/      # LLM, embeddings, external APIs
│   │   │   ├── llm_provider.ts
│   │   │   ├── embeddings.ts
│   │   │   └── external_apis.ts
│   │   ├── utils/
│   │   └── index.ts
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── docs/
│   │   ├── 00-overview.md
│   │   ├── 10-architecture.md
│   │   ├── 20-modules/
│   │   │   ├── runtime.md
│   │   │   ├── cognition.md
│   │   │   ├── memory.md
│   │   │   ├── tools.md
│   │   │   └── integrations.md
│   │   ├── 30-api.md
│   │   ├── 40-examples.md
│   │   ├── 50-troubleshooting.md
│   │   └── 90-adr/
│   │       ├── 001-session-lifecycle.md
│   │       └── 002-memory-architecture.md
│   ├── scripts/
│   │   ├── dev.sh
│   │   ├── test.sh
│   │   └── build.sh
│   ├── package.json
│   ├── README.md              # Entry point
│   ├── AI.md                  # Build rules for this repo
│   ├── tsconfig.json
│   └── jest.config.js
│
├── vi-protocol/               🔥 ACTIVE - Shared contracts
│   ├── src/
│   │   ├── schema/            # Entity definitions
│   │   │   ├── entities.ts
│   │   │   ├── canon.ts
│   │   │   ├── chat.ts
│   │   │   └── tools.ts
│   │   ├── events/            # Event bus contracts
│   │   │   ├── bus.ts
│   │   │   └── topics.ts
│   │   ├── governance/        # Authority, provenance
│   │   │   ├── authority.ts
│   │   │   └── provenance.ts
│   │   └── index.ts
│   ├── tests/
│   ├── docs/
│   │   ├── 00-overview.md
│   │   ├── 10-schemas.md
│   │   ├── 20-events.md
│   │   └── 30-governance.md
│   ├── package.json
│   ├── README.md
│   ├── AI.md
│   └── tsconfig.json
│
└── vi-sdk/                    🔥 ACTIVE - Client SDK
    ├── src/
    │   ├── clients/
    │   │   ├── chat.ts
    │   │   ├── memory.ts
    │   │   ├── tool.ts
    │   │   └── identity.ts
    │   ├── types.ts
    │   └── index.ts
    ├── tests/
    ├── docs/
    │   ├── 00-overview.md
    │   ├── 10-usage.md
    │   └── 20-examples.md
    ├── package.json
    ├── README.md
    ├── AI.md
    └── tsconfig.json
```

---

## clients/ — User-Facing Applications

```
clients/
│
├── command/                   # Command interfaces
│   └── sovereign/             ❄️ FROZEN until Phase 1
│       ├── src/
│       │   ├── app/           # Shell, theme, layout
│       │   │   ├── shell.tsx
│       │   │   ├── theme.tsx
│       │   │   └── layout.tsx
│       │   ├── components/    # Reusable UI
│       │   │   ├── Button.tsx
│       │   │   ├── Panel.tsx
│       │   │   └── Modal.tsx
│       │   ├── pages/
│       │   │   ├── Chat.tsx
│       │   │   ├── Memory.tsx
│       │   │   ├── Tools.tsx
│       │   │   ├── Settings.tsx
│       │   │   └── Dashboard.tsx
│       │   ├── services/      # API clients
│       │   │   ├── vi_client.ts
│       │   │   ├── codex_client.ts
│       │   │   ├── vigil_client.ts
│       │   │   └── aegis_client.ts
│       │   ├── state/         # Global state
│       │   │   ├── store.ts
│       │   │   └── slices/
│       │   ├── types/
│       │   └── main.tsx
│       ├── tests/
│       ├── docs/
│       ├── package.json
│       ├── README.md
│       ├── AI.md
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── index.html
│
├── lore/                      # Lore and worldbuilding
│   └── astralis-codex/        ❄️ FROZEN until Phase 2
│       ├── src/
│       │   ├── domain/        # Entity logic
│       │   │   ├── character.ts
│       │   │   ├── ability.ts
│       │   │   ├── world.ts
│       │   │   ├── faction.ts
│       │   │   ├── artifact.ts
│       │   │   └── event.ts
│       │   ├── canon/         # Canon ledger
│       │   │   ├── ledger.ts
│       │   │   ├── proposal.ts
│       │   │   └── approval.ts
│       │   ├── reasoning/     # Consistency engine
│       │   │   ├── power_scaling.ts
│       │   │   ├── timeline.ts
│       │   │   └── contradiction.ts
│       │   ├── storage/       # Database access
│       │   │   ├── prisma.ts
│       │   │   └── repositories/
│       │   ├── ui/            # React components
│       │   │   ├── EntityEditor.tsx
│       │   │   ├── LedgerViewer.tsx
│       │   │   └── ReasoningPanel.tsx
│       │   ├── import_export/
│       │   │   ├── chatgpt_adapter.ts
│       │   │   ├── markdown_adapter.ts
│       │   │   └── json_adapter.ts
│       │   └── main.tsx
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── tests/
│       ├── docs/
│       ├── package.json
│       ├── README.md
│       ├── AI.md
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── index.html
│
└── discord/                   # Discord interfaces
    └── vigil/                 ❄️ FROZEN until Phase 3+
        ├── src/
        │   ├── bot/           # Discord client setup
        │   │   ├── client.ts
        │   │   ├── commands/
        │   │   │   ├── chat.ts
        │   │   │   ├── memory.ts
        │   │   │   ├── propose.ts
        │   │   │   └── tool.ts
        │   │   └── events/
        │   │       ├── message.ts
        │   │       ├── reaction.ts
        │   │       └── interaction.ts
        │   ├── vi/            # Vi integration
        │   │   ├── bridge.ts
        │   │   └── embed_formatter.ts
        │   ├── storage/       # Guild/user data
        │   │   ├── guild_config.ts
        │   │   └── user_prefs.ts
        │   ├── config/
        │   │   ├── secrets.ts
        │   │   └── settings.ts
        │   └── main.ts
        ├── tests/
        ├── docs/
        ├── package.json
        ├── README.md
        ├── AI.md
        ├── tsconfig.json
        ├── .env.example
        └── jest.config.js
```

---

## packages/ — Shared Code

```
packages/
│
├── tokens/                    # Design tokens (77EZ)
│   ├── src/
│   │   ├── colors.ts
│   │   ├── spacing.ts
│   │   ├── typography.ts
│   │   ├── shadows.ts
│   │   ├── transitions.ts
│   │   └── index.ts
│   ├── dist/
│   │   ├── colors.json
│   │   ├── tokens.css
│   │   └── index.js
│   ├── package.json
│   ├── README.md
│   └── tsconfig.json
│
├── ui/                        # UI component library
│   ├── src/
│   │   ├── components/
│   │   │   ├── Button.tsx
│   │   │   ├── Panel.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── HUD.tsx
│   │   │   ├── CitationBadge.tsx
│   │   │   └── ProvenancePanel.tsx
│   │   ├── hooks/
│   │   │   ├── useTheme.ts
│   │   │   └── useResponsive.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── dist/
│   ├── package.json
│   ├── README.md
│   ├── tsconfig.json
│   └── storybook/
│
├── telemetry/                 # Logging + tracing
│   ├── src/
│   │   ├── logger.ts
│   │   ├── tracer.ts
│   │   ├── metrics.ts
│   │   ├── config.ts
│   │   └── index.ts
│   ├── dist/
│   ├── package.json
│   ├── README.md
│   └── tsconfig.json
│
└── auth-client/               # Aegis SDK stub
    ├── src/
    │   ├── client.ts
    │   ├── types.ts
    │   ├── errors.ts
    │   └── index.ts
    ├── dist/
    ├── package.json
    ├── README.md
    └── tsconfig.json
```

---

## systems/ — Infrastructure Services

```
systems/
│
├── aegis/                     ❄️ FROZEN - Identity + auth
│   ├── src/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── permissions/
│   │   ├── jwt/
│   │   └── main.ts
│   ├── tests/
│   ├── docs/
│   ├── package.json
│   ├── README.md
│   └── AI.md
│
└── sereph/                    ❄️ FROZEN - Hardware bridge
    ├── src/
    │   ├── runtime/
    │   ├── sensors/
    │   ├── actuators/
    │   └── main.ts
    ├── tests/
    ├── docs/
    ├── package.json
    ├── README.md
    └── AI.md
```

---

## ops/ — Operations & Documentation

```
ops/
│
├── tentai-docs/               🔄 GOVERNANCE (not frozen)
│   ├── brand/
│   │   ├── visual.md          # 77EZ identity
│   │   ├── tokens.json        # Canonical token values
│   │   └── tokens.css         # CSS variables
│   ├── playbooks/
│   │   ├── copilot-rules.md   # Main rules (in root)
│   │   ├── repo-structure.md
│   │   └── doc-writing-rules.md
│   ├── specs/
│   │   ├── protocol-spec.md
│   │   ├── api-spec.md
│   │   └── data-formats.md
│   ├── adr/
│   │   └── (shared ADRs go in each repo's docs/90-adr/)
│   ├── README.md
│   └── package.json
│
└── tentai-infra/              ❄️ FROZEN - Deployment
    ├── docker/
    │   ├── Dockerfile.vi
    │   ├── Dockerfile.sovereign
    │   └── docker-compose.yml
    ├── k8s/
    │   ├── vi-deployment.yaml
    │   ├── sovereign-deployment.yaml
    │   └── vigil-deployment.yaml
    ├── terraform/
    │   ├── main.tf
    │   └── variables.tf
    ├── ci-cd/
    │   └── .github/workflows/
    ├── README.md
    └── AI.md
```

---

## Summary by Status

### 🔥 ACTIVE (Unfrozen, actively developed)
- `core/vi/` — Runtime implementation begins here
- `core/vi-protocol/` — Schemas locked here
- `core/vi-sdk/` — SDK built here
- `packages/*` — Shared code used everywhere

### ❄️ FROZEN (Don't touch until unfreeze)
- `clients/command/sovereign/` → Unfreezes after Vi Phase 1
- `clients/lore/astralis-codex/` → Unfreezes after Vi Phase 2
- `clients/discord/vigil/` → Unfreezes after Vi Phase 3+
- `systems/aegis/` → Unfreezes when auth is needed
- `systems/sereph/` → Unfreezes when hardware integration is needed
- `ops/tentai-infra/` → Unfreezes when services stabilize

### 🔄 GOVERNANCE (Rules, not frozen)
- `ops/tentai-docs/` → Update as ecosystem evolves

---

## File Count Summary

| Folder | Files | Purpose |
|--------|-------|---------|
| core/vi/ | 26 dirs | Runtime implementation |
| core/vi-protocol/ | 8 dirs | Shared contracts |
| core/vi-sdk/ | 4 dirs | Client SDK |
| clients/command/sovereign/ | 15 dirs | Web UI |
| clients/lore/astralis-codex/ | 18 dirs | Universe builder |
| clients/discord/vigil/ | 10 dirs | Discord bot |
| packages/ | 8 dirs | Shared libraries |
| systems/ | 8 dirs | Infrastructure |
| ops/ | 8 dirs | Documentation |
| Root | 8 files | Configuration |

**Total:** ~110+ directories created, ~8 governance documents

---

## Next Steps

1. Implement core/vi Phase 1
2. Lock vi-protocol schemas
3. Build vi-sdk once Vi API stable
4. Unfreeze Sovereign (Phase 2)
5. Unfreeze Astralis (Phase 3)
6. Unfreeze Vigil (Phase 4+)

---

**Version:** 1.0 (Phase 0 Complete)
**Last Updated:** 2025-01-01
**Status:** Ready for Phase 1 implementation
