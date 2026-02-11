# Vi-Protocol Overview

## What It Is

vi-protocol is the **contract layer** for the Tentai ecosystem. Every repo imports from it.

Think of it as the API that prevents repos from inventing their own rules:

- All memory records follow vi-protocol schema
- All tool calls use vi-protocol format
- All events use vi-protocol envelopes
- All entities (characters, abilities, etc.) follow vi-protocol schemas
- All citations and provenance use vi-protocol format

## Why It Matters

Without shared contracts:

- vi-core invents one memory format, Command Center invents another
- vibot invents its own tool call format
- Codex creates its own canon schema
- **Result:** Incompatibility, rewrites, chaos

With contracts:

- Every repo implements the same interfaces
- Tool outputs are standardized
- Memory is portable across systems
- Citations work everywhere
- **Result:** One brain, multiple clients (clean)

## Core Schemas

### Entities
- **Character** — Name, description, abilities, relations
- **Ability** — Name, power level, effects, limitations
- **World** — Name, setting, rules, factions
- **Faction** — Name, ideology, members, goals
- **Artifact** — Name, power, origin, effects
- **Event** — Name, date, participants, consequences

### Canon
- **Proposal** — Draft entity or change
- **Approval state** — Draft, In Review, Approved, Rejected
- **Provenance** — Who proposed it, when, evidence
- **Conflict rules** — What can't exist together
- **Ledger entry** — Immutable record of approval

### Chat
- **Message** — Text, author, timestamp, metadata
- **Conversation** — Thread of messages with context
- **Citation** — Reference to source (memory record, entity, etc.)
- **Evidence** — What information supports this claim

### Tools
- **Tool definition** — Name, description, parameters, output schema
- **Tool call** — Which tool, with what parameters
- **Tool result** — Output (success or error), metadata

### Memory
- **Record** — Text, metadata (source, confidence, timestamp)
- **Memory type** — Fact, event, relation, reasoning, etc.
- **Metadata** — Author, timestamp, confidence level (0-1), source

### Events
- **Envelope** — Event type, topic, payload, timestamp
- **Topics** — Codex updates, Bot events, Command Center actions

### Governance
- **Authority** — Who can do what (roles + permissions)
- **Provenance** — Source tracking, confidence levels
- **Approval** — Required roles for each action

## Usage

```typescript
import { Character, MemoryRecord, ToolCall, Citation } from 'vi-protocol';

// Create a typed entity
const character: Character = {
  id: 'char_kaelen',
  name: 'Kaelen',
  description: '...',
  abilities: ['...'],
  // ... follows schema
};

// Create a memory record
const fact: MemoryRecord = {
  id: 'mem_123',
  text: 'Kaelen is the creator',
  source: 'user',
  confidence: 1.0,
  timestamp: new Date(),
};

// Create a citation
const citation: Citation = {
  recordId: 'mem_123',
  confidence: 1.0,
  source: 'user',
};
```

## Phases

### Phase 0: Lock Contracts (NOW)
- ✅ Entity schemas
- 🔄 Canon ledger schemas
- 🔄 Chat/citation schemas
- 🔄 Tool call/response formats
- 🔄 Memory record formats
- 🔄 Event envelope types

### Phase 1+: Use Everywhere
- vi-core uses these schemas for memory and tools
- Command Center uses these for chat display
- Codex uses these for entities and canon
- vibot uses these for tool outputs

## Next Steps

1. Read [docs/10-architecture](docs/10-architecture) for schema design
2. Review [docs/90-adr](docs/90-adr) for decisions
3. Import from vi-protocol in all other repos
