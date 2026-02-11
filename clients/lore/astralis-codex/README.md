# clients/lore/astralis-codex — Universe Builder

Astralis Codex is where you build and govern the fictional universe. Characters, abilities, worlds, factions—all with provenance, approval chains, and reasoning engines.

## What Is Astralis Codex?

Astralis Codex is:
- **Character Library** — Define characters with abilities, personalities, backgrounds
- **World Builder** — Create worlds, environments, timelines
- **Canon Ledger** — Propose changes, vote, track approval chain
- **Consistency Engine** — Detect contradictions, check power scaling, validate timelines
- **Import/Export** — Bring in ChatGPT conversations, Markdown, JSON

## Architecture

Astralis is organized into:

- **domain/** — Entity definitions (Character, Ability, World, Faction, Artifact, Event)
- **canon/** — Canon ledger (proposals, approvals, provenance chains)
- **reasoning/** — Consistency checks (power scaling, timeline validation)
- **storage/** — Prisma ORM, repositories
- **ui/** — React components and pages
- **import_export/** — Adapters for external formats

## Key Concepts

### Entities

Everything in Astralis is an entity:

```typescript
// Character
{
  id: 'char-001',
  name: 'Aria',
  abilities: ['telekinesis', 'flight'],
  background: '...',
  personality: '...',
  powerLevel: 8.5
}

// World
{
  id: 'world-001',
  name: 'Aetheria',
  timeline: [{ year: 0, event: '...' }, ...],
  factions: ['The Council', 'The Resistance'],
  magic_system: '...'
}
```

### Canon Ledger

Changes to entities go through a governance process:

```
1. Propose: "Add ability 'reality-warp' to Aria"
2. Review: Reviewers check for contradictions, power scaling
3. Vote: Community votes (if applicable)
4. Approve: Change is approved
5. Implement: Change goes live
6. Provenance: History of who changed what and when
```

### Consistency Engine

Astralis checks for logical conflicts:

- **Power Scaling** — Is Aria's new power balanced against existing characters?
- **Timeline Consistency** — Do events conflict with established history?
- **Contradiction Detection** — Can a character both teleport and be bound to one location?
- **Faction Rules** — Does this character align with their faction's values?

```typescript
const result = await codex.reasoning.validateChange({
  entity: ariCharacter,
  change: { abilities: ['telekinesis', 'flight', 'reality-warp'] }
});

if (!result.valid) {
  console.log(result.conflicts);
  // [
  //   { type: 'power_scaling', message: 'Reality-warp exceeds faction limits' },
  //   { type: 'timeline', message: 'Conflicts with Year 50 events' }
  // ]
}
```

## Pages

### Entities
Browse and edit characters, worlds, factions, artifacts.

### Canon Ledger
Propose changes, review proposals, vote, see approval history.

### Reasoning
View consistency checks, power scaling analysis, timeline validation.

### Import/Export
Bulk-import from ChatGPT, Markdown, JSON. Export to various formats.

## Design System

Uses 77EZ design tokens:
- **Void-Black** — Backgrounds
- **Sovereign Gold** — Primary accents (approvals)
- **Controlled Cyan** — Secondary accents (proposals)
- **Purple Accent** — Highlights (conflicts)

**Important:** Import from `@tentai/tokens`.

```typescript
import { colors } from '@tentai/tokens';

const approvedStyle = { backgroundColor: colors.sovereignGold };
const proposedStyle = { backgroundColor: colors.controlledCyan };
```

## Database

Uses Prisma for database access. Schema is in `prisma/schema.prisma`.

Entities are stored persistently, not in memory.

## Status

❄️ **FROZEN** until Vi Phase 2 complete.

**Unfreeze Milestones:**
- [ ] Vi has stable cognition pipeline
- [ ] Vi-protocol has locked entity schemas
- [ ] Evidence trails and citations working
- [ ] Canon ledger contracts finalized

Once Vi can reason about canon and provide evidence, Astralis unfreezes.

## Development Rules

See [AI.md](./AI.md) for build rules specific to this repo.

Also read:
- [copilot-rules.md](../../../copilot-rules.md) — Ecosystem-wide rules
- [STRUCTURE.md](../../../STRUCTURE.md) — Why this structure exists

## Contributing

Once unfrozen, read [AI.md](./AI.md) before starting work.

## Vision

Astralis is more than a database. It's a governance engine for fictional worlds:
- Anyone can propose changes
- Community votes on canon
- Reasoning engine prevents inconsistencies
- Full audit trail of every change
- Multi-format import/export

Later phases may include:
- AI-powered character generation
- Timeline visualization
- Interactive world maps
- Faction conflict simulation
