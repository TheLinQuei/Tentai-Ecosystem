# Tentai Ecosystem — Final Structure

## The Core Principle

**Vi is not a library. Vi is the product.**

This structure reflects that: `vi` is the AI runtime. Everything else is a client, or infrastructure supporting Vi.

## Root Structure

```
Tentai Ecosystem/
  ├── core/                    # The brain and standards
  │   ├── vi/                  # 🔥 THE AI RUNTIME (was vi-core)
  │   ├── vi-protocol/         # 🔥 Shared contracts
  │   └── vi-sdk/              # 🔥 Client SDKs
  │
  ├── clients/                 # Clients talk to Vi
  │   ├── command/
  │   │   └── sovereign/       # Command console (was vi-command-center)
  │   ├── lore/
  │   │   └── astralis-codex/  # Universe builder
  │   └── discord/
  │       └── vigil/           # Discord bot (was vibot)
  │
  ├── systems/                 # Cross-cutting infrastructure
  │   ├── aegis/               # Identity + auth
  │   └── sereph/              # Hardware/runtime integration
  │
  ├── packages/                # Shared code (NEW)
  │   ├── tokens/              # Design tokens package
  │   ├── ui/                  # UI component library
  │   ├── telemetry/           # Telemetry client
  │   └── auth-client/         # Aegis SDK
  │
  └── ops/                     # Operations and docs
      ├── tentai-docs/         # Brand, specs, playbooks
      └── tentai-infra/        # Docker, K8s, CI/CD
```

## Why This Structure

### 1. Product vs Library (core/vi)
- **Before:** `vi-core` sounds like an internal library
- **Now:** `core/vi` says "this is the actual product"
- **Effect:** Prevents the "accidental SDK" problem

### 2. Categorical Clients (clients/)
- **Before:** `clients/vi-command-center`, `clients/vibot`, etc. (flat list)
- **Now:** `clients/command/sovereign/`, `clients/discord/vigil/` (categorized)
- **Scaling:** When you add `clients/mobile/app/`, `clients/web/dashboard/`, the structure already handles it

### 3. Branded Names (sovereign, vigil, astralis-codex)
- **Command Center → Sovereign** (the throne, authority, command)
- **Vibot → Vigil** (sentinel, watcher, guardian)
- **Astralis Codex** (already perfect, no change)
- **Why:** Names matter. They prevent "generic UI" syndrome.

### 4. Packages for Reusable Code (NEW)
- **Problem:** Right now, both Sovereign and Astralis would duplicate UI components, tokens, telemetry
- **Solution:** Central packages/ folder
  - Each package has its own package.json
  - Can be used locally or published later
  - Single source of truth for design tokens

```
packages/tokens/
  package.json         # npm publish this later
  src/
    colors.json        # CANONICAL tokens
    spacing.json
    typography.json

packages/ui/
  package.json
  src/
    components/        # Button, Panel, HUD, etc.
    hooks/
    types/

packages/telemetry/
  package.json
  src/
    logger.ts
    tracer.ts
    metrics.ts

packages/auth-client/
  package.json
  src/
    client.ts          # Aegis SDK stub
```

Clients import from packages:
```typescript
// In Sovereign
import { Button, Panel } from '@tentai/ui';
import { colors, spacing } from '@tentai/tokens';
import { Logger } from '@tentai/telemetry';

// In Astralis
import { Button } from '@tentai/ui';  // Same component
import { colors } from '@tentai/tokens';  // Same tokens
```

### 5. Frozen Status Remains
- Only `core/vi` and `core/vi-protocol` are active
- All clients are frozen until their unfreeze milestones
- `packages/` can be worked on during core development (UI stubs, token imports)

---

## File Moves (Old → New)

| Old Path | New Path | Why |
|----------|----------|-----|
| core/vi-core/ | core/vi/ | Product, not library |
| clients/vi-command-center/ | clients/command/sovereign/ | Categorical + branded |
| clients/vibot/ | clients/discord/vigil/ | Categorical + branded |
| clients/astralis-codex/ | clients/lore/astralis-codex/ | Categorical (keep name) |

---

## Services References (Updated)

When clients import services, paths change:

**Old:**
```typescript
import { ViCoreClient } from '@tentai/vi-core-client';
```

**New:**
```typescript
import { ViClient } from '@tentai/vi-sdk';  // Cleaner: it's the VI client, period
```

In **Sovereign** (`clients/command/sovereign/src/services/`):
- `vi-client/` — calls core/vi API (was vi-core-client)
- `codex-client/` — calls astralis-codex
- `vigil-client/` — calls vigil (Discord bot)
- `aegis-client/` — calls aegis

---

## Active Development (Phase 0 → Phase 1)

### What's Being Built Right Now
- ✅ `core/vi` — The brain
- ✅ `core/vi-protocol` — Contracts
- 🔄 `packages/tokens` — Make it importable
- 🔄 `packages/ui` — Component stubs (doesn't need Vi yet)
- 🔄 `packages/telemetry` — Logger stubs

### What's Frozen (Don't Touch)
- ❌ `clients/command/sovereign/` — Waits for vi API
- ❌ `clients/lore/astralis-codex/` — Waits for entity schemas + vi
- ❌ `clients/discord/vigil/` — Waits for vi API
- ❌ `systems/aegis/` — Waits for what needs auth
- ❌ `systems/sereph/` — Waits for vi maturity
- ❌ `ops/tentai-infra/` — Waits for services to stabilize

---

## Migration Notes

### For Existing Git Repos
If you have local git repos:

```bash
# Old structure
rm -rf core/vi-core/
git clone ... core/vi/

# Update references in every client
# Old: import from 'vi-core-client'
# New: import from 'vi-sdk'

# vi-protocol and vi-sdk stay the same
```

### No Breaking Changes for Ops
- `ops/tentai-docs/` — Same structure, no changes
- `ops/tentai-infra/` — Adds services later
- `FREEZE.md`, `UNIMPLEMENTED_BY_DESIGN.md` — Unchanged

---

## Going Forward

This structure scales:

```
clients/
  command/
    sovereign/       # Web console
    mobile/          # Mobile app
    desktop/         # Desktop app
  lore/
    astralis-codex/  # Web universe builder
    mobile/          # Mobile lore viewer
  discord/
    vigil/           # Discord bot
    slack/           # Slack bot
  research/          # (future) Research tools
  analytics/         # (future) Analytics dashboard
```

Same principle: **clients/ are all clients. They import from packages/. They talk to core/vi.**

---

## Summary: Why This Matters

| Aspect | Before | After | Impact |
|--------|--------|-------|--------|
| **Product clarity** | "vi-core sounds like a library" | "core/vi is THE product" | Prevents SDK mindset |
| **Client organization** | Flat list grows chaotic | Categorical with depth | Scalable to 10+ clients |
| **Shared code** | Duplication between Sovereign and Astralis | packages/ as single source | DRY + consistency |
| **Naming** | Generic names (Command Center, Vibot) | Branded (Sovereign, Vigil) | Identity, professionalism |
| **Tokens** | Copied around, easy to diverge | Single package, imported everywhere | 77EZ enforced |

**Result:** A system that looks like it was planned for scale, not scrambled together.
