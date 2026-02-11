# clients/command/sovereign — Web Command Console

**Status:** ✅ UNFROZEN (Phase 1 Complete) — MVP Chat Interface Operational

Sovereign is the god-console of Tentai. A web application where you talk to Vi, see memory, run tools, and manage settings.

## What Is Sovereign?

Sovereign is your primary interface to Vi. When Vi is thinking, reasoning, or executing tools, you see it happen here. Currently implemented:

- ✅ **Chat with Vi** — Send messages, get responses with evidence trails
- 🔜 **View Memory** — Short-term (this session), long-term (learned over time)
- 🔜 **Manage Tools** — See what's available, run tools manually
- 🔜 **Configure Settings** — Auth, preferences, integrations
- 🔜 **View Dashboard** — System health, recent activity

## Why "Sovereign"?

- Signals authority and control
- Clearer brand identity than "Command Center"
- Memorable one-word name

## Quick Start

```bash
# Install dependencies
npm install

# Run development server (connects to Vi on :3000)
npm run dev

# Browse to http://localhost:3001

# Run production build
npm run build
npm start
```

### Environment Variables

- `SOVEREIGN_PORT` — Port for Sovereign web server (default: 3001)
- `VI_API_URL` — URL to Vi backend (default: http://localhost:3000)

## Current Architecture (MVP)

**Phase 1.1: Minimal Chat Interface**

```
public/
  └── index.html        # Chat UI (vanilla HTML/CSS/JS)
src/
  └── server.ts         # Express server + /api/chat proxy
```

**Flow:**
1. User enters message in browser
2. HTTP POST to `/api/chat` (Sovereign server)
3. Sovereign proxies to Vi's `POST /v1/chat`
4. Response returned and displayed

**Tech Stack:**
- Frontend: Vanilla HTML/CSS/JavaScript (no framework for speed)
- Backend: Express.js + TypeScript
- Styling: 77EZ tokens (void-black, sovereign gold, controlled cyan)

## Roadmap (Future)

**Phase 1.2: React Modernization**
- Migrate to React + TypeScript
- Component-based architecture (reusable Button, Panel, Modal, etc.)
- State management (Zustand or Redux)

**Phase 2: Memory Viewer**
- Short-term memory (this session) display
- Long-term memory search
- Citation viewer

**Phase 3: Tool Manager**
- List available tools
- Execute tools manually
- View tool results

**Phase 4: Settings & Dashboard**
- User preferences
- System health metrics
- Activity logs
│ • Vi responded with Y           │
│ • User then asked about Z       │
│                                 │
│ Long-Term:                      │
│ [Search box]                    │
└─────────────────────────────────┘
```

### Tools
Browse available tools, execute them manually.

```
┌─────────────────────────────────┐
│ Tools                           │
├─────────────────────────────────┤
│ • query-codex                   │
│   Search the canon ledger       │
│   [Arguments] [Execute]         │
│                                 │
│ • execute-tool                  │
│   Run any registered tool       │
│   [Arguments] [Execute]         │
└─────────────────────────────────┘
```

## Design System

All UI uses 77EZ design tokens:
- Void-Black (#0A0E27) — backgrounds
- Sovereign Gold (#D4AF37) — primary accents
- Controlled Cyan (#00D9FF) — secondary accents
- Purple Accent (#9D4EDD) — highlights

**Important:** Import colors from `@tentai/tokens`, never hardcode hex values.

```typescript
import { colors, spacing } from '@tentai/tokens';

const styles = {
  background: colors.voidBlack,
  accentColor: colors.sovereignGold,
  padding: spacing.lg,
};
```

## Dependencies

- **@tentai/tokens** — Design system
- **@tentai/ui** — Reusable components
- **@tentai/telemetry** — Logging and tracing
- **vi-sdk** — Client SDK for Vi
- **React** — UI framework
- **TypeScript** — Type safety

## Status

❄️ **FROZEN** until Vi Phase 1 complete.

**Unfreeze Milestone:**
- [ ] Vi has working Chat API
- [ ] Vi can manage sessions
- [ ] Vi can access memory
- [ ] Vi can execute tools
- [ ] Response format includes citations

Once these are done, Sovereign development begins.

## Development Rules

See [AI.md](./AI.md) for build rules specific to this repo.

Also read:
- [copilot-rules.md](../../../copilot-rules.md) — Ecosystem-wide rules
- [STRUCTURE.md](../../../STRUCTURE.md) — Why this structure exists

## Contributing

Once unfrozen, read [AI.md](./AI.md) before starting work.

## Future

- Mobile version (React Native)
- Voice interface
- Plugin system
- Custom themes
