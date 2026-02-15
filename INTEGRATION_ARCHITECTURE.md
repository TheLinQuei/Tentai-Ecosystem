# Tentai Ecosystem - Integration Architecture

**Status:** Day 2 Complete - Fresh rebuild with clean architecture

## Design Principle

**Vi is the brain. Everything else connects to Vi.**

```
┌─────────────────────────────────────────────────────────┐
│                    Vi Core Brain                         │
│  (intelligence, memory, reasoning, language models)      │
└────────────────────┬────────────────────────────────────┘
                     │
           ┌─────────┼─────────┐
           │         │         │
      discord    calendar    lore
      adapter    adapter    adapter
           │         │         │
    ┌──────▼─────────▼─────────▼──────────┐
    │          Products Layer               │
    │                                       │
    │  ├─ Sovereign (Chat Console)         │
    │  ├─ Vigil (Discord Bot)               │
    │  ├─ Sol Calendar (Calendar App)      │
    │  └─ Lore (Data System)                │
    └───────────────────────────────────────┘
```

## How Products Connect

### 1. Vigil (Discord Bot)
- **Location:** `products/vigil/`
- **Files Extracted:** 23 command files + Discord client setup
- **What it does:** Handles Discord messages/slash commands
- **How it connects to Vi:**
  ```typescript
  // products/vigil/adapters/vi/index.ts
  sendToVi(discordMessage) → Core brain processes
  brain responds → send back to Discord
  ```
- **Integration point:** `core/vi/src/integrations/discord/`

### 2. Sol Calendar (Calendar App)
- **Location:** `products/sol-calendar/`
- **Files Extracted:** 10 JavaScript files + CSS
- **What it does:** Calendar UI with event management
- **How it connects to Vi:**
  ```typescript
  // products/sol-calendar/adapters/vi/index.ts
  parseEventFromText("lunch tomorrow at noon") → Vi NLP
  Vi extracts: {title, date, time} → Calendar displays
  ```
- **Integration point:** `core/vi/src/integrations/calendar/`

### 3. Lore System (Character/Ability Data)
- **Location:** `products/lore/data/`
- **Files Extracted:** Character JSONs, ability definitions, race data
- **What it does:** Provides context for Vi's reasoning
- **How it connects to Vi:**
  ```typescript
  // products/lore/adapters/vi/index.ts
  // When user asks about "Akima", lore system provides:
  // - Character description
  // - Abilities and traits
  // - Faction relationships
  // Vi uses this as context for responses
  ```
- **Integration point:** `core/vi/src/integrations/lore/`

### 4. Sovereign (Chat Console)
- **Location:** `projects/sovereign/`
- **Adapter:** `projects/sovereign/adapters/vi/index.ts`
- **What it does:** Web UI for chatting with Vi
- **Connection:** Direct to Vi REST API

---

## Integration Points in Core Vi

### Discord Integration
**File:** `core/vi/src/integrations/discord/index.ts`

Defines the interface that Vigil uses:
- `DiscordContext` - Message metadata (user, guild, channel, content)
- `IDiscordIntegration` - Methods Vi implements
- `processMessage()` - Routes Discord messages to brain
- `registerCommand()` - Registers Discord commands with Vi
- `buildContext()` - Adds Discord-specific reasoning info

### Calendar Integration
**File:** `core/vi/src/integrations/calendar/index.ts`

Defines the interface that Sol Calendar uses:
- `CalendarEvent` - Structured event data
- `ICalendarIntegration` - Methods Vi implements
- `parseEvent()` - Natural language → events
- `suggestDetails()` - AI suggestions for event creation
- `getHolidays()` - Holiday lookups

### Lore Integration
**File:** `core/vi/src/integrations/lore/index.ts`

Defines the interface that lore system provides:
- `getCharacter()` - Load character by ID
- `searchCharacters()` - Semantic search
- `registerContext()` - Register context with Vi's memory
- `buildNarrativeContext()` - Generate context for reasoning

---

## File Structure

```
Tentai Ecosystem/
├── core/vi/
│   ├── src/
│   │   ├── brain/              <- Vi's intelligence
│   │   ├── memory/             <- Knowledge store
│   │   ├── runtime/            <- Server/API
│   │   └── integrations/       <- PRODUCT CONNECTORS
│   │       ├── discord/        <- Vigil interface
│   │       ├── calendar/       <- Sol Calendar interface
│   │       └── lore/           <- Lore system interface
│   └── docker-compose.yml      <- Starts Vi services
│
├── products/
│   ├── vigil/
│   │   ├── commands/           <- Discord slash commands (23)
│   │   ├── client/             <- Discord.js setup
│   │   ├── adapters/vi/        <- CONNECTS TO Vi
│   │   └── scripts/
│   │
│   ├── sol-calendar/
│   │   ├── src/                <- Calendar UI (10 files)
│   │   ├── styles/             <- CSS
│   │   ├── adapters/vi/        <- CONNECTS TO Vi
│   │   └── index.html
│   │
│   ├── lore/
│   │   ├── data/
│   │   │   ├── characters/     <- Character JSONs
│   │   │   ├── abilities/      <- Ability JSONs
│   │   │   ├── races/          <- Race JSONs
│   │   │   └── cards/          <- Card data
│   │   └── adapters/vi/        <- CONNECTS TO Vi
│   │
│   └── sovereign/
│       ├── src/                <- Chat console
│       ├── adapters/vi/        <- CONNECTS TO Vi
│       └── ...
│
├── clients/                    <- Legacy (kept for reference)
├── packages/                   <- Shared code
├── docs/                       <- Documentation
└── ...
```

---

## Data Flow Example: "Lunch with Sarah tomorrow"

```
User (Web/Discord): "Schedule a lunch with Sarah tomorrow at noon"
                        ↓
              Sol Calendar / Discord
                        ↓
         products/*/adapters/vi/parseEventFromText()
                        ↓
              core/vi/src/integrations/calendar/
                        ↓
           Vi Brain (NLP + Reasoning)
           - Parse natural language
           - Extract: title="Lunch with Sarah", date=tomorrow, time="12:00"
           - Check lore: Who is Sarah? (if in character database)
                        ↓
              Returns structured event
                        ↓
          Calendar displays / Discord confirms
```

---

## How to Add a New Product

1. **Create directory:** `products/newproduct/`
2. **Create Vi adapter:** `products/newproduct/adapters/vi/index.ts`
3. **Define integration:** `core/vi/src/integrations/newproduct/index.ts`
4. **Implement interface:** Extend `IProductIntegration` in core/vi
5. **Test:** Send requests to Vi, verify responses

---

## What Was Removed (Intentionally)

From Vigil:
- ❌ `apps/brain/` - Vi has its own brain
- ❌ `apps/memory/` - Vi has its own memory system
- ❌ Duplicate Prisma schema - Vi manages database
- ❌ Duplicate modules - Commands only

From Sol Calendar:
- ❌ Standalone app logic
- ❌ `android/`, `electron/` builds - Web-first approach
- ❌ Independent state management

From Lore:
- ❌ Game mechanics - Focus on data
- ❌ Runtime trackers - Vi owns state

---

## Next Steps (Day 3)

1. ✅ Implement `core/vi/src/integrations/*` (stub files created)
2. ⏳ Connect Vi's router to integration endpoints
3. ⏳ Test: Vigil → Vi → response
4. ⏳ Test: Sol Calendar natural language → Vi parsing
5. ⏳ Test: Lore context → Vi reasoning

---

## Files Modified This Session

**Deleted:**
- `/projects/` directory (bad migration)
- Duplicate brain/memory from Vigil
- Duplicate Prisma schema

**Created:**
- `/products/vigil/` - 23 commands, client setup
- `/products/sol-calendar/` - UI, styles, assets
- `/products/lore/data/` - Character, ability, race JSONs
- `/core/vi/src/integrations/` - Product connection interfaces
- `AUDIT_REBUILD.md` - This audit document

**Modified:**
- `projects/sovereign/adapters/vi/index.ts` - Updated chat interface

---

**Status Summary:**
- ✅ Audit complete
- ✅ Structure redesigned
- ✅ Files extracted (only usable code)
- ✅ Integration points defined (3 files)
- ✅ Product adapters created (4 files)
- ⏳ Integration implementation (next phase)
