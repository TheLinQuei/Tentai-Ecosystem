// Deprecated: Use the built-in JSON-driven decree system via /decree.
// This file remains only to avoid breaking references; it performs no action.
// Canonical flow:
//  - Edit `memory/decree.json` (version, seq++, sections)
//  - Run the bot and use `/decree reload` (or `/decree post` to force)
//  - Auto-post on boot when seq/hash changed and autopost=true

console.warn("[postDecreeEmbed] Deprecated. Use /decree (src/features/diagnostics.ts) with memory/decree.json.");
process.exit(0);
