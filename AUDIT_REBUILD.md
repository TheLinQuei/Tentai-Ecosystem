# Tentai Ecosystem - Complete Rebuild Audit
**Date:** February 14, 2026  
**Goal:** Extract ONLY usable components from external repos and integrate with Vi as the core brain

---

## Architecture Vision

```
Tentai Ecosystem/
├── core/
│   └── vi/                    <- THE BRAIN (everyone connects here)
└── products/
    ├── sovereign/             <- Chat UI that talks to Vi
    ├── vigil/                <- Discord commands that talk to Vi
    ├── sol-calendar/         <- Calendar UI that talks to Vi
    └── lore/                 <- Context/data that Vi consumes
```

**Key Principle:** Vi is the ONLY brain. Products are thin clients with adapters.

---

## External Repo Audit

### 1. vi-discord-bot (Vigil)
**Location:** `c:\Users\Shyke\vi-discord-bot`

**Directories Found:**
- `.git`, `.github` - Meta
- `admin/`, `control-center-v2/`, `golden/` - Admin tools (?)
- **`apps/`** - Contains brain/memory subsystems (DUPLICATE)
- `data/`, `memory/`, `logs/` - Runtime data
- `dist/`, `node_modules/` - Build artifacts
- `docs/` - Documentation
- `infra/`, `lavalink/` - Infrastructure
- **`packages/`** - Shared code
- `prisma/` - Database schema (DUPLICATE)
- **`scripts/`** - Utility scripts
- `secrets/` - Credentials
- **`src/`** - Discord bot source code
- `test/` - Tests

**KEEP (Usable):**
- ✅ `src/` - Discord bot commands, slash commands, message handlers
- ✅ `src/commands/` - Discord command implementations
- ✅ `src/events/` - Discord event handlers  
- ✅ `src/types/` - Discord-specific types
- ✅ `scripts/deploy-commands.ts` - Discord command registration
- ✅ Discord.js integration patterns

**DISCARD (Duplicates Vi):**
- ❌ `apps/brain/` - We have `core/vi/brain/`
- ❌ `apps/memory/` - We have `core/vi/memory/`
- ❌ `packages/` - Create Vi adapter instead
- ❌ `prisma/` - Vi has its own schema
- ❌ `infra/`, `lavalink/` - Not needed
- ❌ All build artifacts, node_modules, logs

**EXTRACT:**
- Discord command patterns → `products/vigil/commands/`
- Discord.js client setup → `products/vigil/client/`
- Vi adapter pattern → `products/vigil/adapters/vi/`

---

### 2. LoreOS (Lore System)
**Location:** `c:\Users\Shyke\LoreOS`

**Directories Found:**
- `abilities/`, `characters/`, `races/` - **Core lore data** (JSON/MD)
- `battles/`, `The Ladder/`, `Trackers/` - Game mechanics
- `Cards/` - Card data
- `logs/`, `memory/` - Runtime data
- `Modules/` - System modules (?)

**KEEP (Usable):**
- ✅ `characters/*.json` - Character definitions
- ✅ `abilities/*.json` - Ability data
- ✅ `races/*.json` - Race data
- ✅ `Cards/` - Card definitions
- ✅ Character embeddings (if they exist) for Vi context

**DISCARD:**
- ❌ `Modules/` - Likely duplicate logic
- ❌ `logs/`, `memory/` - Runtime data
- ❌ `battles/`, `The Ladder/`, `Trackers/` - Game mechanics (keep if needed later)

**EXTRACT:**
- Lore data → `products/lore/data/`
- Vi context loader → `products/lore/adapters/vi/` (for character/ability lookups)

---

### 3. Sol Calender (Calendar App)
**Location:** `e:\Sol Calender`

**Directories Found:**
- **`src/`**, `styles/` - Frontend source
- `android/`, `electron/` - Native app builds
- `assets/` - Static assets
- `console/` - ??? (duplicate sovereign?)
- `docs/` - Documentation
- `node_modules/`, `out/`, `releases/`, `www/` - Build artifacts
- `scripts/` - Build scripts

**KEEP (Usable):**
- ✅ `src/` - Calendar UI components
- ✅ `styles/` - CSS/design
- ✅ Calendar event parsing logic
- ✅ Date/time utilities
- ✅ UI patterns for event creation

**DISCARD:**
- ❌ `android/`, `electron/` - We'll build as web-first
- ❌ `console/` - Likely duplicate
- ❌ All build artifacts
- ❌ Standalone app logic (convert to Vi-connected UI)

**EXTRACT:**
- Calendar UI → `products/sol-calendar/ui/`
- Event models → `products/sol-calendar/types/`
- Vi adapter for natural language → `products/sol-calendar/adapters/vi/`

---

## Detailed File Inventory

### Vigil - Discord Commands (VERIFIED)
**Files Found:** 20 command files
- `beep.ts`, `claim.ts`, `clean.ts`, `event.ts`, `factions.ts`
- `guardian.ts`, `join.ts`, `leave.ts`, `lfg.ts`, `poll.ts`
- `postpings.ts`, `purge.ts`, `refresh.ts`, `say.ts`, `seed_rules.ts`
- `skip.ts`, `status.ts`, `vibrain.ts`
- Plus: `index.ts`, `_types.ts`

**Also Need:**
- `src/core/` - Discord client setup
- `src/integrations/` - Discord.js patterns
- `scripts/deploy-commands.ts` - Command registration

### Sol Calendar - UI Components (VERIFIED)
**Files Found:** 10 core files
- `app.js` - Main app
- `calendar.js` - Calendar logic
- `auth.js`, `groups.js`, `holidays.js` - Features
- `state.js`, `storage.js`, `sync.js` - State management
- `pwa-install.js`, `capacitor-init.js` - App wrappers

**Also Need:**
- `styles/` - CSS
- `index.html` - Entry point
- `assets/` - Icons/images

### Lore - Character/Ability Data (VERIFIED)
**Files Found:**
- `characters/pre-grace-akima.json` + `.md`
- `abilities/1.json`, `adaptive-instinct.json`, `resonant-sensitivity-(dormant).json` + `.md`
- Plus all other character/ability files

**Structure:** Dual format (JSON for data, MD for descriptions)

---

## Fresh Structure Design

```
Tentai Ecosystem/
├── core/
│   └── vi/                           <- THE BRAIN (unchanged)
│       ├── src/brain/               <- Vi's intelligence
│       ├── src/memory/              <- Vi's memory
│       ├── src/runtime/             <- Vi's server
│       └── src/integrations/        <- NEW: Integration points
│           ├── discord/            <- Discord adapter interface
│           ├── calendar/           <- Calendar adapter interface
│           └── lore/               <- Lore context provider
│
├── products/
│   ├── sovereign/                   <- Chat Console (EXISTING)
│   │   ├── src/                    <- Already has Vi adapter
│   │   └── adapters/vi/            <- Already connected
│   │
│   ├── vigil/                      <- Discord Bot (NEW)
│   │   ├── commands/               <- Discord slash commands
│   │   │   ├── beep.ts
│   │   │   ├── poll.ts
│   │   │   ├── vibrain.ts         <- Sends to Vi
│   │   │   └── ...
│   │   ├── client/                 <- Discord.js setup
│   │   ├── adapters/vi/            <- Vi integration
│   │   │   ├── index.ts           <- Send message to Vi
│   │   │   └── types.ts           <- Discord message types
│   │   ├── scripts/
│   │   │   └── deploy-commands.ts <- Register commands
│   │   └── package.json
│   │
│   ├── sol-calendar/               <- Calendar App (NEW)
│   │   ├── src/
│   │   │   ├── app.js             <- Main app
│   │   │   ├── calendar.js        <- Calendar logic
│   │   │   └── ...
│   │   ├── styles/                 <- CSS
│   │   ├── adapters/vi/            <- Vi integration
│   │   │   ├── index.ts           <- Natural language parsing
│   │   │   └── types.ts           <- Event types
│   │   ├── index.html
│   │   └── package.json
│   │
│   └── lore/                       <- Lore System (NEW)
│       ├── data/
│       │   ├── characters/        <- Character JSONs
│       │   ├── abilities/         <- Ability JSONs
│       │   ├── races/             <- Race JSONs
│       │   └── cards/             <- Card data
│       ├── adapters/vi/            <- Vi context loader
│       │   ├── index.ts           <- Query lore data
│       │   └── types.ts           <- Lore types
│       └── README.md
│
├── docs/                           <- Documentation (unchanged)
├── packages/                       <- Shared code (unchanged)
├── systems/                        <- Infrastructure (unchanged)
└── ops/                           <- Operations (unchanged)
```

---

## Next Steps

1. ✅ **Audit complete** - Know exactly what to extract
2. ⏳ **Delete `/projects/`** - Remove bad migration
3. ⏳ **Create `/products/` structure** - Build fresh directories
4. ⏳ **Extract Vigil files** - Commands + Discord logic only
5. ⏳ **Extract Sol Calendar files** - UI + calendar logic only
6. ⏳ **Extract Lore files** - Data files only
7. ⏳ **Create Vi adapters** - For each product
8. ⏳ **Update core/vi/integrations** - Add integration points
9. ⏳ **Test** - Verify everything connects to Vi

**Files to Migrate:**
- Vigil: ~25 files (commands + client)
- Sol Calendar: ~15 files (UI + logic)
- Lore: ~10-20 files (character/ability data)

**Total:** ~60 usable files ✅
