# Lore System

Character, ability, and race data for the 77EZ universe. Used by Vi for context-aware reasoning and storytelling.

## Structure

- `data/characters/` - Character definitions (JSON + descriptions in MD)
- `data/abilities/` - Ability definitions
- `data/races/` - Race definitions
- `data/cards/` - Card data
- `adapters/vi/` - Vi integration (lore lookups for reasoning)

## Data Format

### Character Example
```json
{
  "id": "pre-grace-akima",
  "name": "Pre-Grace Akima",
  "description": "...",
  "abilities": ["resonant-sensitivity-dormant"],
  "race": "tenkai"
}
```

### Ability Example
```json
{
  "id": "adaptive-instinct",
  "name": "Adaptive Instinct",
  "description": "...",
  "type": "passive"
}
```

## How Vi Uses This

1. When processing Discord messages about characters/abilities
2. When generating narrative content
3. When reasoning about faction dynamics
4. Stored as context vectors for semantic search

See `/adapters/vi/index.ts` for integration.
