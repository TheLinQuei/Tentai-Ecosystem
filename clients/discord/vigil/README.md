# clients/discord/vigil — Discord Bot

Vigil is a Discord bot that brings Vi to Discord. Send a message to Vigil, and Vi responds. Create proposals in the canon ledger, run tools, query memory—all from Discord.

## What Is Vigil?

Vigil is:
- **Chat Interface** — Message Vigil, get responses from Vi
- **Canon Interface** — Create and vote on canon proposals from Discord
- **Tool Executor** — Run tools via slash commands
- **Moderation Bot** — Server moderation, permissions
- **Sentinel** — Watches the server, alerts on events

## Why "Vigil"?

- Signals watchfulness and vigilance
- Clearer brand identity than "Vibot"
- Memorable one-word name
- Fits the namespace (Vi, Sovereign, Astralis, Vigil)

## Quick Start

Vigil is currently FROZEN. It will unfreeze when auth and Vi API are stable.

```bash
# Install dependencies (once unfrozen)
npm install

# Configure bot token (see .env.example)
# Add to .env: DISCORD_BOT_TOKEN=your_token

# Run bot
npm run start

# Run tests
npm run test
```

## Architecture

Vigil is organized into:

- **bot/** — Discord client, commands, event handlers
- **vi/** — Bridge to Vi (ChatClient, MemoryClient, ToolClient)
- **storage/** — Guild configs, user preferences
- **commands/** — Slash command implementations
- **events/** — Message, reaction, interaction handlers

## Key Commands

### Chat

```
/chat message: "What can you tell me about character X?"
```

Vigil sends the message to Vi, waits for response, returns it with citations.

```
@Vigil X is a character known for ...
[Source: astralis-codex] [Confidence: 95%]
```

### Memory

```
/memory query: "characters with telekinesis"
```

Returns relevant long-term memories.

### Propose

```
/propose entity: "Character X" change: "Add ability Y"
```

Creates a canon proposal. Server members vote on it.

### Tools

```
/tool name: "query-codex" args: "entityId=X"
```

Execute any registered tool from Discord.

## Embeds

Discord embeds use 77EZ colors:

```typescript
import { colors } from '@tentai/tokens';

const embed = new EmbedBuilder()
  .setColor(colors.sovereignGold)  // Primary accent
  .setTitle('Vi Response')
  .setDescription(response.text);
```

**Never hardcode hex values.** Always import from `@tentai/tokens`.

## Permissions

Different commands require different permissions:

| Command | Permission |
|---------|-----------|
| /chat | everyone |
| /memory | everyone |
| /propose | canon:propose |
| /approve | canon:approve |
| /tool | admin |

Permissions come from Aegis (identity service).

## Status

❄️ **FROZEN** until Vi API stable and auth system defined.

**Unfreeze Milestones:**
- [ ] Vi has stable Chat API
- [ ] Auth system (Aegis) defines permissions
- [ ] Discord.js integration tested
- [ ] Slash commands working

Once these are done, Vigil development begins.

## Development Rules

See [AI.md](./AI.md) for build rules specific to this repo.

Also read:
- [copilot-rules.md](../../../copilot-rules.md) — Ecosystem-wide rules
- [STRUCTURE.md](../../../STRUCTURE.md) — Why this structure exists

## Contributing

Once unfrozen, read [AI.md](./AI.md) before starting work.

## Future

- Reaction-based interactions
- Custom themes per server
- Rich media support (images, videos)
- Streaming responses
- Voice channel integration
