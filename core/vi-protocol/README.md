# vi-protocol

**The contracts.** Shared schemas and event definitions for the Tentai ecosystem.

## What This Is

vi-protocol defines the contracts that prevent repos from inventing their own rules:

- **Entity schemas** — Character, Ability, World, Faction, Artifact, Event
- **Canon schemas** — Proposals, approval states, provenance, conflict rules
- **Chat schemas** — Conversations, messages, citations
- **Tool schemas** — Tool definitions, call formats, result formats
- **Memory schemas** — Memory record formats (structured, with metadata)
- **Event envelopes** — Event bus types and topic definitions
- **Governance schemas** — Authority, permissions, audit logs

## Structure

```
schema/
  ├── entities/    # Character, Ability, World, Faction, Artifact, Event
  ├── canon/       # Proposals, ledger states, provenance
  ├── chat/        # Conversations, messages, citations
  ├── tools/       # Tool definitions, call/response formats
  └── memory/      # Memory record schemas

events/
  ├── bus/         # Event envelope types
  └── topics/      # Published topics (codex, bot, command-center)

governance/
  ├── authority/   # Who can do what
  └── provenance/  # Source tracking, confidence levels
```

## Usage

All repos import from `vi-protocol`:

```typescript
import { Character, Ability, MemoryRecord, ToolCall } from 'vi-protocol';
```

No repo invents its own schema. This is enforced.

## Phase 0 (Foundation)

Currently: **defining and locking contracts**

Phase 0 deliverables:
- 🔄 Entity schemas (Character, Ability, World, etc.)
- 🔄 Canon ledger schemas
- 🔄 Chat/citation schemas
- 🔄 Tool call/response formats
- 🔄 Event envelope types
- 🔄 Memory record formats

## Docs

- [00-overview](docs/00-overview) — Schema overview
- [10-architecture](docs/10-architecture) — Design decisions
- [90-adr](docs/90-adr) — Architecture Decision Records

## See Also

- [vi-core](../vi-core) — Uses these contracts
- [vi-command-center](../../clients/vi-command-center) — Uses these contracts
- [astralis-codex](../../clients/astralis-codex) — Uses these contracts
