// src/commands/index.ts
import type { CommandModule } from "./_types";

// Import each command module
import * as beep from "./beep";
import * as clean from "./clean";
import * as guardian from "./guardian";
import * as join from "./join";
import * as leave from "./leave";
import * as lfg from "./lfg";
import * as purge from "./purge";
import * as say from "./say";
// import * as seed_rules from "./seed_rules"; // moved to Command Center
import * as skip from "./skip";
// import * as vibrain from "./vibrain"; // moved to Command Center
import * as factions from "./factions";
import * as postpings from "./postpings";
import * as poll from "./poll";
import * as xp from "./xp";
import * as guide from "../features/guide";
import * as xp_reminder from "./xp-reminder";
import * as music from "../features/music";
import * as weather from "./weather";
import * as event from "./event";
import * as claim from "./claim";

// ✅ progression commands (XP, Economy, Shop)
import { progressionCommands } from "../features/progression";

// ✅ capabilities command module
import * as capabilities from "../features/capabilities";

// ✅ remote access commands (owner-only) — moved to Command Center
// import * as status from "./status";
// import * as refresh from "./refresh";

// ⛔ diagnostics: keep diag only, move decree to Command Center
import { diagSlash } from "../features/diagnostics";

/* ───────────────────────── helpers ───────────────────────── */

/** Safely get a candidate export: prefer default, else the module obj itself. */
function pickExport<T extends object>(mod: any): T {
  if (!mod) return mod;
  // if it re-exports a "default" that's the actual module, prefer that
  if (mod.default && typeof mod.default === "object") return mod.default as T;
  return mod as T;
}

/** Loose check for something that *looks* like a command data object */
function hasCommandData(x: any): boolean {
  // discord.js SlashCommandBuilder exposes .name as a getter and .toJSON()
  return !!x && typeof x === "object" && typeof x.name === "string" && typeof x.toJSON === "function";
}

/** Normalize many export shapes into a CommandModule without mutating originals. */
function normalizeModule(x: any): CommandModule | null {
  const m = pickExport<any>(x);

  // Already looks like a CommandModule
  if (m && hasCommandData(m.data) && (typeof m.run === "function" || typeof m.execute === "function")) {
    return m as CommandModule;
  }

  // Some modules export { data, run } or { data, execute } directly
  if (m && hasCommandData(m.data) && (typeof m.run === "function" || typeof m.execute === "function")) {
    return m as CommandModule;
  }

  // Some export named values (e.g., export const data, export const execute)
  if (m && hasCommandData(m.data) && m.execute) {
    return { data: m.data, execute: m.execute, autocomplete: m.autocomplete, components: m.components } as CommandModule;
  }
  if (m && hasCommandData(m.data) && m.run) {
    return { data: m.data, run: m.run, autocomplete: m.autocomplete, components: m.components } as CommandModule;
  }

  // Some “feature” folders export a single object like diagSlash/capabilitiesSlash/etc.
  if (hasCommandData(m?.data) && (typeof m?.run === "function" || typeof m?.execute === "function")) {
    return m as CommandModule;
  }

  // Nothing matched
  return null;
}

/** Strict-ish guard AFTER normalization (keeps logs clean). */
function isCommandModule(x: any): x is CommandModule {
  return !!x && typeof x === "object" && hasCommandData((x).data) && (
    typeof (x).run === "function" || typeof (x).execute === "function"
  );
}

/* ────────────────────── aggregate & export ───────────────────── */

const rawCandidates: any[] = [
  beep, clean, guardian, join, leave, lfg,
  purge, say, /* seed_rules, */ skip, /* vibrain, */ factions,
  postpings, poll, xp, xp_reminder, event, claim,
  // progression commands (XP, Economy, Shop with handlers) — exclude admin ops moved to Command Center
  ...progressionCommands.filter(c => !["give", "setlevel", "setbalance"].includes(c?.data?.name)),
  // diagnostics / features (keep diag only)
  diagSlash, guide, music,
  // capabilities
  capabilities,
  // optional guide exporter maintained as a command as well
  { data: guide.exportData, execute: guide.export_execute },
  // remote access (owner-only) moved to Command Center (status, refresh)
  // weather
  weather,
];

const normalized: Array<CommandModule | null> = rawCandidates.map(normalizeModule);

// Keep only valid modules; collect bad ones for a helpful log
const bad: any[] = [];
export const commands: CommandModule[] = normalized.filter((m, idx) => {
  const ok = isCommandModule(m);
  if (!ok) bad.push(rawCandidates[idx]);
  return ok;
});

if (bad.length) {
  const names = bad.map((b, i) => (b?.data?.name ?? b?.default?.data?.name ?? `#${i}`));
  console.error(`[commands] Invalid modules filtered: ${bad.length} (${names.join(", ")})`);
}

console.log(`[commands] Loaded: ${commands.map(c => c.data.name).join(", ")}`);
