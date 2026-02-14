# Tentai Ecosystem Repository Reorganization Plan

## Date: February 14, 2026

## Objective
Clean up and reorganize the entire Tentai Ecosystem repository into a **clean, maintainable monorepo structure** with clear project boundaries and no outdated files.

---

## Current Problems

### 1. **Scattered Projects**
- Console app in `packages/ui/console-app/` (partially moved to `projects/sovereign/`)
- Sol Calendar in separate repository `e:\Sol Calender\`
- Discord bot in separate repository `c:\Users\Shyke\vi-discord-bot\`
- Lore system in separate repository `c:\Users\Shyke\LoreOS\`

### 2. **Massive Documentation Clutter**
- **70+ outdated MD files** with names like:
  - `PHASE-0-1-COMPLETION.md`, `PHASE-1-COMPLETE.md`, `PHASE-2-PROGRESS.md` (redundant phase docs)
  - `77EZ_COMPLETION_REPORT.md`, `77EZ_VERIFICATION_REPORT.md` (old test docs)
  - `MILESTONE-1-COMPLETION.md` through `MILESTONE-9-COMPLETION.md` (archived milestones)
  - `AUDIT_CERTIFICATION_AND_HANDOFF.md`, `COMPREHENSIVE_AUDIT.md`
  - `DEPLOYMENT_READINESS_REPORT.md`, `IMPLEMENTATION_CHECKLIST.md`

### 3. **Test File Accumulation**
- `test-results.txt`, `test-output.txt`, `test-output2.txt`, `test-results-phase2.txt`
- Old test logs scattered across directories

### 4. **Duplicate/Redundant Files**
- Multiple README files with conflicting info
- Duplicate configuration files
- Old deployment guides

---

## Target Structure

```
/Tentai Ecosystem/
│
├── /core/                      # Core infrastructure & services
│   ├── /vi/                    # Vi backend (main AI service)
│   │   ├── /src/               # Source code
│   │   ├── /prisma/            # Database schemas
│   │   ├── /tests/             # KEEP: Active tests only
│   │   ├── /docs/              # KEEP: Current API docs only
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   ├── /vi-protocol/           # Vi protocol specs
│   ├── /vi-sdk/                # Vi SDK for integrations
│   └── /overseer/              # Overseer service
│
├── /projects/                  # User-facing applications
│   ├── /sovereign/             # Chat console (EXISTING)
│   │   ├── /src/               # React UI
│   │   ├── /adapters/vi/       # Vi integration
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── /sol-calendar/          # Calendar app (MOVE FROM e:\Sol Calender\)
│   │   ├── /src/               # Calendar UI
│   │   ├── /android/           # Android build
│   │   ├── /electron/          # Desktop build
│   │   ├── /adapters/vi/       # NEW: Vi integration
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── /vigil/                 # Discord bot (MOVE FROM c:\Users\Shyke\vi-discord-bot\)
│   │   ├── /src/               # Bot source
│   │   ├── /prisma/            # Bot database
│   │   ├── /adapters/vi/       # NEW: Vi integration
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── /lore/                  # Lore system (EXTRACT FROM c:\Users\Shyke\LoreOS\)
│       ├── /characters/        # Character data
│       ├── /abilities/         # Abilities
│       ├── /memory/            # Lore memory system
│       ├── /adapters/vi/       # NEW: Vi integration for lore
│       └── README.md
│
├── /packages/                  # Shared libraries
│   ├── /auth-client/           # KEEP
│   ├── /telemetry/             # KEEP
│   ├── /tokens/                # KEEP
│   └── /ui/                    # CLEAN: Remove console-app, keep shared components only
│       ├── /components/        # KEEP: Shared UI components
│       ├── /hooks/             # KEEP: Shared hooks
│       └── /types/             # KEEP: Shared types
│
├── /clients/                   # CLEANUP: Remove if redundant with /projects/
│   └── (evaluate each)
│
├── /docs/                      # Documentation (MASSIVE CLEANUP NEEDED)
│   ├── README.md               # Main docs index
│   ├── QUICKSTART.md           # Getting started
│   ├── /api/                   # API documentation
│   ├── /architecture/          # Architecture docs
│   └── /archive/               # DELETE MOST: Keep only reference-worthy docs
│
├── /ops/                       # Operations & infrastructure
│   └── (keep minimal)
│
├── /systems/                   # System utilities
│   ├── /aegis/                 # KEEP
│   └── /sereph/                # KEEP
│
├── package.json                # Root workspace config
├── pnpm-workspace.yaml         # Workspace definition
├── tsconfig.json               # Root TypeScript config
└── README.md                   # Main repository README

```

---

## Execution Plan

### Phase 1: Stop All Services ✅
```powershell
# Check for running Vi services
Get-Process | Where-Object {$_.Name -like "*node*" -or $_.Name -like "*vi*"}

# Stop if found (will do this first)
```

### Phase 2: Create Clean Project Structure
- [x] Create `/projects/sovereign/` (DONE)
- [ ] Create `/projects/sol-calendar/`
- [ ] Create `/projects/vigil/`
- [ ] Create `/projects/lore/`

### Phase 3: Move Sol Calendar
#### From: `e:\Sol Calender\`
#### To: `/projects/sol-calendar/`

**Keep:**
- `/src/` - All source code
- `/android/` - Android build files
- `/electron/` - Electron build files
- `/assets/` - Images and resources
- `/styles/` - CSS themes
- `package.json`, `capacitor.config.ts`, `vite.config.ts`
- `index.html`, `app.html`, `landing.html`

**Delete:**
- `/docs/*.md` - Old documentation (merge into single README)
- All `*_GUIDE.md`, `*_REPORT.md`, `*_COMPLETE.md` files
- `/console/` - This is redundant with Sovereign

**Actions:**
```powershell
# Copy entire Sol Calendar
Copy-Item "e:\Sol Calender\*" -Destination "e:\Tentai Ecosystem\projects\sol-calendar\" -Recurse -Exclude @("node_modules", "dist", ".git", "console")

# Delete docs clutter
Remove-Item "e:\Tentai Ecosystem\projects\sol-calendar\*.md" -Exclude "README.md"
Remove-Item "e:\Tentai Ecosystem\projects\sol-calendar\docs\" -Recurse -Force
```

### Phase 4: Move Discord Bot (Vigil)
#### From: `c:\Users\Shyke\vi-discord-bot\`
#### To: `/projects/vigil/`

**Keep:**
- `/src/` - Bot source code
- `/apps/` - Brain, memory apps
- `/packages/` - Shared packages
- `/prisma/` - Database schemas
- `/scripts/` - Utility scripts
- `package.json`, `tsconfig.json`, `docker-compose.yml`
- Essential config: `.env.example`, `pnpm-workspace.yaml`

**Delete:**
- All `*_REPORT.md`, `*_GUIDE.md`, `*_COMPLETE.md` files
- `/docs/` - Merge into single README
- `/test/`, `/tests/` old test files
- `/logs/` - All log directories
- `/golden/` - Old test artifacts
- `/lavalink/` - Music system (evaluate if still used)
- `/control-center-v2/` - Redundant with Sovereign?

**Actions:**
```powershell
# Copy Discord bot essentials
Copy-Item "c:\Users\Shyke\vi-discord-bot\src" -Destination "e:\Tentai Ecosystem\projects\vigil\" -Recurse
Copy-Item "c:\Users\Shyke\vi-discord-bot\apps" -Destination "e:\Tentai Ecosystem\projects\vigil\" -Recurse
Copy-Item "c:\Users\Shyke\vi-discord-bot\packages" -Destination "e:\Tentai Ecosystem\projects\vigil\" -Recurse
Copy-Item "c:\Users\Shyke\vi-discord-bot\prisma" -Destination "e:\Tentai Ecosystem\projects\vigil\" -Recurse
Copy-Item "c:\Users\Shyke\vi-discord-bot\package.json" -Destination "e:\Tentai Ecosystem\projects\vigil\"
```

### Phase 5: Extract Lore System
#### From: `c:\Users\Shyke\LoreOS\`
#### To: `/projects/lore/`

**Keep:**
- `/characters/` - Character JSON/MD files
- `/abilities/` - Abilities JSON/MD files
- `/races/` - Race definitions
- `/memory/` - Memory embeddings and sessions
- `/Cards/` - Card data
- `Lore_Index.md`

**Delete:**
- `/logs/` - Empty/unnecessary logs

**Actions:**
```powershell
# Copy Lore essentials
Copy-Item "c:\Users\Shyke\LoreOS\*" -Destination "e:\Tentai Ecosystem\projects\lore\" -Recurse -Exclude @("logs", "node_modules")
```

### Phase 6: Clean Vi Core
#### In: `/core/vi/`

**Keep:**
- `/src/` - All source code
- `/prisma/` - Database schemas
- `/tests/` - **Only active, passing tests**
- `/docs/` - **Only current API docs**
- Essential configs: `package.json`, `tsconfig.json`, `docker-compose.yml`

**Delete:**
- `test-output.txt`, `test-output2.txt`, `test-results.txt`, `test-results-phase2.txt`
- `/docs/MILESTONE-*.md` (archive these)
- Old completion reports

**Actions:**
```powershell
cd "e:\Tentai Ecosystem\core\vi"
Remove-Item "test-*.txt"
Remove-Item "docs\MILESTONE-*.md"
```

### Phase 7: Clean Documentation
#### In: `/docs/`

**Current state:** 70+ MD files, mostly redundant

**Target state:**
```
/docs/
├── README.md              # Documentation index
├── QUICKSTART.md          # Getting started guide
├── /api/                  # API documentation
│   └── vi-api.md
├── /architecture/         # Architecture docs
│   └── overview.md
└── /archive/              # KEEP ONLY REFERENCE-WORTHY
    └── (5-10 important docs max)
```

**Delete (95% of /docs/archive/):**
- All `PHASE-*.md` files (redundant progress reports)
- All `77EZ_*.md` files (old test reports)
- All `*_COMPLETION*.md` files (outdated milestones)
- All `*_REPORT.md` files (except final production report)
- All `*_GUIDE.md` files (duplicate quickstart info)

**Keep in /docs/ (main level):**
- `README.md`
- Current deployment guides if actively used
- Current API documentation

### Phase 8: Clean Packages
#### In: `/packages/ui/`

**Delete:**
- `/packages/ui/console-app/` - **MOVED TO `/projects/sovereign/`**
- `/packages/ui/console/` - Redundant

**Keep:**
- `/packages/ui/components/` - Shared components
- `/packages/ui/hooks/` - Shared hooks
- `/packages/ui/types/` - Shared types

### Phase 9: Evaluate `/clients/`

Current:
```
/clients/command/sovereign/
/clients/discord/vigil/
/clients/lore/astralis-codex/
```

**Decision:**
- If these are just symlinks or old references → DELETE
- If they contain unique code → MERGE into `/projects/`

### Phase 10: Create Vi Adapters

For each project, create `/adapters/vi/` with:
- `index.ts` - Main exports
- `hooks.ts` - React hooks (if applicable)
- `services.ts` - API services
- `types.ts` - TypeScript types
- `config.ts` - Project-specific Vi config

**Already done:** Sovereign ✅
**TODO:** Sol-Calendar, Vigil, Lore

---

## Files to Delete (Examples)

### Root Level
```
IMPLEMENTATION_STATUS.md (duplicate)
test-results-billing.txt (old test file)
```

### Core Vi
```
core/vi/test-output.txt
core/vi/test-output2.txt
core/vi/test-results.txt
core/vi/test-results-phase2.txt
core/vi/docs/MILESTONE-1-COMPLETION.md ... MILESTONE-9-COMPLETION.md
```

### Docs Archive (DELETE ~60 FILES)
```
docs/archive/77EZ_COMPLETION_REPORT.md
docs/archive/77EZ_VERIFICATION_REPORT.md
docs/archive/AUDIT_CERTIFICATION_AND_HANDOFF.md
docs/archive/AUTH_UX_TEST_GUIDE.md
docs/archive/COMPLETION_SUMMARY.md
docs/archive/COMPREHENSIVE_AUDIT.md
docs/archive/DEPLOYMENT_READINESS_REPORT.md
docs/archive/IMPLEMENTATION_CHECKLIST.md
docs/archive/PACKAGE_SUMMARY.md
docs/archive/PHASE_*.md (all)
docs/archive/PHASE-*.md (all)
docs/archive/SESSION_*.md (all)
docs/archive/TEST_*.md (all)
docs/archive/PREMIUM_AUTH_UX_SUMMARY.md
docs/archive/VISUAL_GUIDE.md
docs/archive/VERIFICATION_VISUAL_SUMMARY.md
```

### Docs Status (DELETE MOST)
```
docs/status/77EZ_TEST_*.md
docs/status/PHASE_*.md
```

### Docs Guides (CONSOLIDATE)
```
docs/guides/77EZ_FULL_TEST_SUITE.md (old test suite)
```

---

## Rollback Strategy

1. **Git tag before starting:**
   ```powershell
   git tag pre-reorganization-2026-02-14
   git push origin pre-reorganization-2026-02-14
   ```

2. **Keep external repos intact** until verified:
   - Don't delete `e:\Sol Calender\` until verified in monorepo
   - Don't delete `c:\Users\Shyke\vi-discord-bot\` until verified
   - Don't delete `c:\Users\Shyke\LoreOS\` until verified

3. **Test after each phase**

---

## Success Criteria

1. ✅ All projects in `/projects/` folder
2. ✅ Each project has working `/adapters/vi/` integration
3. ✅ Less than 10 MD files in `/docs/archive/`
4. ✅ No test output files (`*.txt`) in repository
5. ✅ All projects build successfully
6. ✅ Deployments still work (Sovereign, Vi backend)
7. ✅ Clean `git status` (no untracked files)

---

## Timeline

**Day 1 (Today):**
- Stop services
- Create project structure
- Move Sol Calendar
- Initial cleanup

**Day 2:**
- Move Discord bot (Vigil)
- Create Vigil Vi adapter
- Extract Lore system

**Day 3:**
- Delete outdated documentation
- Clean up test files
- Verify all builds work

**Day 4:**
- Final testing
- Update root README
- Tag and deploy

---

## Commands Reference

### Stop Services
```powershell
# Check running processes
Get-Process | Where-Object {$_.ProcessName -match "node|vi|npm|pnpm"}

# Stop all Node processes (if needed)
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
```

### Create Backup
```powershell
git tag pre-reorganization-$(Get-Date -Format "yyyy-MM-dd")
git push origin --tags
```

### Bulk Delete MD Files
```powershell
cd "e:\Tentai Ecosystem\docs\archive"
Remove-Item "PHASE*.md" -Force
Remove-Item "77EZ*.md" -Force
Remove-Item "*COMPLETION*.md" -Force
```

---

**Status:** READY TO EXECUTE
**Next Step:** Stop services and create backup tag
