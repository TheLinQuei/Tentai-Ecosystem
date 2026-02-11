# vi-sdk

**Client SDKs.** TypeScript/Node + Python + C# libraries for building Vi clients.

## What This Is

vi-sdk makes it easy for any client (web, Discord bot, hardware system) to talk to vi-core:

- **TypeScript/Node.js SDK** — Primary, feature-complete
- **Python SDK** — Coming later
- **C# SDK** — Coming later

## TypeScript SDK

```typescript
import { ViClient } from 'vi-sdk';

const vi = new ViClient('http://localhost:8000');

// Send a message, get a response with citations
const response = await vi.chat({
  userId: 'user123',
  message: 'Who is Kaelen?',
  sessionId: 'session456'
});

console.log(response.text);
console.log(response.citations); // Where did this come from?
```

## Architecture

```
src/
  ├── typescript/
  │   ├── client.ts       # Main ViClient
  │   ├── messages.ts     # Message types
  │   ├── memory.ts       # Memory queries
  │   └── tools.ts        # Tool calls
  └── node/
      ├── api.ts          # HTTP client
      └── utils.ts        # Node-specific helpers
```

## Phase 0 (Foundation)

Currently: **establishing structure and API**

Phase 0 deliverables:
- 🔄 TypeScript client skeleton
- 🔄 Message and response types (from vi-protocol)
- 🔄 Basic examples

## Development

### Install Dependencies
```bash
npm install
```

### Build
```bash
npm run build
```

### Tests
```bash
npm test
```

## Docs

- [00-overview](docs/00-overview) — Quick start
- [10-architecture](docs/10-architecture) — SDK design
- [90-adr](docs/90-adr) — Design decisions

## See Also

- [vi-core](../vi-core) — What the SDK calls
- [vi-protocol](../vi-protocol) — Schemas the SDK uses
- [vi-command-center](../../clients/vi-command-center) — Example client
