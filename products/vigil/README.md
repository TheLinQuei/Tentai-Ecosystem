# Vigil - Discord Bot

Discord bot that connects to Vi core for intelligent command processing.

## Structure

- `commands/` - Discord slash commands (23 commands)
- `client/` - Discord client setup and initialization
- `adapters/vi/` - Vi integration (messages → brain processing)
- `scripts/` - Utility scripts (deploy commands, etc.)

## Commands

- `beep` - Ping command
- `claim` - Claim system
- `event` - Event management
- `factions` - Faction commands
- `guardian` - Guardian commands
- `join`, `leave` - Guild commands
- `lfg` - Looking for group
- `poll` - Polling system
- `vibrain` - Talk to Vi
- And more...

## How It Works

1. User sends Discord message or slash command
2. `adapters/vi/` captures Discord context
3. Sends to Vi core with user ID, guild ID, channel info
4. Vi processes and responds
5. Bot posts response back to Discord

## Setup

```bash
npm install
npm run build
npm start
```

Deploy commands:
```bash
npm run scripts deploy-commands
```

See `/adapters/vi/index.ts` for Vi integration.
