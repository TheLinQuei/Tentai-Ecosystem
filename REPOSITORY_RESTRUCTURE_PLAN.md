# Repository Restructure: Unified Monorepo

## Overview
Consolidate the Tentai Ecosystem under a single unified monorepo structure with clear separation of concerns: core Vi infrastructure, projects (Sovereign, Sol-Calendar, Vigil), and adapters.

## Current State
```
/Tentai Ecosystem (monorepo)
  /core/vi/                    # Vi backend
  /packages/ui/console-app/    # Sovereign console UI
  
/sol-calendar (separate repo)  # Calendar project UI
  /console/
```

**Problem**: Projects are fragmented across separate repositories. Makes unified deployment and Version control difficult.

## Target State

```
/Tentai Ecosystem/
│
├── /core/
│   ├── /vi/                  # Core Vi backend (unchanged)
│   ├── /vi-protocol/         # Vi protocol specs
│   ├── /vi-sdk/              # Vi SDK for integrations
│   └── /overseer/            # Overseer service
│
├── /projects/                # User-facing applications
│   ├── /sovereign/           # Chat console (currently packages/ui/console-app)
│   │   ├── /src/
│   │   ├── /public/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── /adapters/
│   │       └── /vi/          # Vi integration for console
│   │           ├── index.ts
│   │           ├── hooks.ts
│   │           └── services.ts
│   │
│   ├── /sol-calendar/        # Calendar project (moved from separate repo)
│   │   ├── /src/
│   │   ├── /public/
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── /adapters/
│   │       └── /vi/          # Vi integration for calendar
│   │           ├── index.ts
│   │           ├── hooks.ts
│   │           └── services.ts
│   │
│   └── /vigil/               # Discord bot project
│       ├── /src/
│       ├── package.json
│       ├── tsconfig.json
│       └── /adapters/
│           └── /vi/          # Vi integration for Discord
│               ├── index.ts
│               ├── handlers.ts
│               └── services.ts
│
├── /adapters/                # Shared adapter patterns (optional)
│   └── /vi/                  # Vi integration patterns & docs
│       └── ADAPTER_GUIDE.md
│
├── /packages/                # Shared packages & libraries
│   ├── /auth-client/
│   ├── /telemetry/
│   ├── /tokens/
│   └── /ui/                  # UI shared components
│       ├── /components/
│       ├── /hooks/
│       ├── /types/
│       └── /console/         # Console-specific components
│
├── /core/                     # Core infrastructure (unchanged)
│   ├── /overseer/
│   ├── /vi/
│   ├── /vi-protocol/
│   └── /vi-sdk/
│
├── /clients/                  # Client integrations (unchanged)
│   ├── /command/sovereign/
│   ├── /discord/vigil/
│   └── /lore/astralis-codex/
│
├── /docs/                     # Documentation (unchanged)
│
├── /ops/                      # Operations (unchanged)
│
└── /systems/                  # Systems (unchanged)
```

## Migration Strategy

### Phase 1: Create New Project Structure
- Create `/projects/sovereign/` with Sovereign console
- Copy `/sol-calendar` → `/projects/sol-calendar/`
- Create Vi adapters in each project

### Phase 2: Update Build Pipelines
- Update GitHub Actions to build each project from new location
- Update `package.json` workspaces to include new structure
- Test local development with `npm i` at root

### Phase 3: Deploy & Verify
- Update GitHub Pages to build from `/projects/sovereign/`
- Verify Render backend still works with new structure
- Test all three projects (Sovereign, Sol-Calendar, Vigil)

### Phase 4: Cleanup
- Archive old `/packages/ui/console-app/`
- Update documentation
- Remove separate `/sol-calendar` repository link

## Benefits
- **Single source of truth**: All projects in one repo
- **Shared dependencies**: DRY principle for common packages
- **Unified deployment**: Deploy all projects from single CI/CD
- **Easier collaboration**: One git repo to clone
- **Clear separation**: Each project has own adapters/integrations
- **Scalability**: Easy to add new projects (Nexus, Hermes, etc.)

## Vi Adapter Pattern

Each project will have a `/adapters/vi/` folder with:

```
/projects/{project}/adapters/vi/
├── index.ts              # Main export
├── hooks.ts              # React hooks (useChat, useUser, etc.)
├── services.ts           # API calls, data fetching
├── types.ts              # TS interfaces
└── config.ts             # Project-specific Vi config
```

Example:
```typescript
// /projects/sovereign/adapters/vi/index.ts
export { useChat, useUser, useSettings } from './hooks';
export { sendChatMessage, fetchAuditTraces } from './services';
export type { ChatMessage, SafetyProfile } from './types';
```

This allows each project to:
- Import Vi utilities: `import { useChat } from '../adapters/vi'`
- Have project-specific configuration
- Keep UI logic separate from Vi integration

## Timeline
- **Day 1**: Create project structure, move files
- **Day 2**: Update build pipelines, test builds
- **Day 3**: Verify deployments, update docs
- **Day 4**: Full testing, cleanup

## Rollback Plan
- Keep git history intact (can revert commits)
- Tag current version before migration: `git tag pre-restructure`
- Archive old repos if needed

## Success Criteria
- All three projects build successfully from `/projects/`
- Deployments work (Sovereign on GH Pages, calendar, Vigil)
- Vi integration works in all three projects
- No data loss or functionality regression
- Documentation updated
