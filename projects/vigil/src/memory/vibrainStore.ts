import { promises as fs } from "fs";
import path from "path";

/** ============================== Paths =============================== **/

let FILE = process.env.VIBRAIN_PATH ?? path.resolve(process.cwd(), "memory", "vibrain.json");
export function setVibrainPath(p: string) { FILE = p; }

/** ============================== Types =============================== **/

// Normalized view we expose to the rest of the bot
export type UserMemory = {
  id: string;
  aliases: string[];
  facts: string[];                    // short bullets
  prefs: Record<string, any>;
  trust: number;                      // -2..+2 typical, but we won't clamp
  lastSeenISO: string;
  notes: string[];
  // legacy/extra fields we preserve if present:
  name?: string;
  displayName?: string;
  emotion?: string;
  personaTier?: string;
  lastSeen?: number;                  // legacy epoch
  tags?: string[];
  archived?: boolean;
};

export type GuildMemory = {
  id: string;
  name?: string;
  memberCount?: number;
  joins?: number;
};

// Raw shapes from legacy file are untyped (we preserve everything).
type RawBrain = Record<string, any>;

/** ============================== State =============================== **/

let raw: RawBrain = { _schema: 1, users: {}, guilds: {} };
let extras: Record<string, any> = {};  // everything not users/guilds/_schema stays here
let dirty = false;
let writing = false;
let timer: NodeJS.Timeout | null = null;

/** ============================== IO =============================== **/

async function atomicWrite(file: string, data: string) {
  const tmp = file + ".tmp";
  const bak = file + ".bak";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, data, "utf8");
  // Preserve a backup of the last good state if present
  try {
    await fs.copyFile(file, bak).catch(() => {});
  } catch {}
  await fs.rename(tmp, file);
}

function scheduleSave() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flushNow().catch(() => {}); }, 400);
  dirty = true;
}

export async function flushNow() {
  if (!dirty || writing) return;
  writing = true;
  try {
    // Recompose: extras + core keys
    const out: any = { ...extras, _schema: raw._schema ?? 1, users: raw.users ?? {}, guilds: raw.guilds ?? {} };
    await atomicWrite(FILE, JSON.stringify(out, null, 2));
    dirty = false;
  } finally { writing = false; }
}

export function getBrainPath() { return FILE; }

export async function loadBrain() {
  try {
    const txt = await fs.readFile(FILE, "utf8");
    const parsed: RawBrain = JSON.parse(txt);

    // Keep core & extras
    raw = {
      _schema: parsed._schema ?? 1,
      users: parsed.users ?? {},
      guilds: parsed.guilds ?? {},
    };
    extras = Object.fromEntries(
      Object.entries(parsed).filter(([k]) => k !== "_schema" && k !== "users" && k !== "guilds")
    );

    console.log(`[ViBrain] Loaded JSON: ${FILE}`);
  } catch {
    // Attempt recovery from backup if available
    const bak = FILE + ".bak";
    try {
      const bakTxt = await fs.readFile(bak, "utf8");
      const parsed: RawBrain = JSON.parse(bakTxt);
      raw = {
        _schema: parsed._schema ?? 1,
        users: parsed.users ?? {},
        guilds: parsed.guilds ?? {},
      };
      extras = Object.fromEntries(
        Object.entries(parsed).filter(([k]) => k !== "_schema" && k !== "users" && k !== "guilds")
      );
      console.warn(`[ViBrain] Recovered state from backup: ${bak}`);
    } catch {
      raw = { _schema: 1, users: {}, guilds: {} };
      extras = {};
      await atomicWrite(FILE, JSON.stringify({ _schema: 1, users: {}, guilds: {} }, null, 2));
      console.log(`[ViBrain] Initialized new JSON at: ${FILE}`);
    }
  }
  return exportBrain();
}

export function exportBrain() {
  return { _schema: raw._schema, users: raw.users, guilds: raw.guilds, ...extras };
}

/** ============================== Users =============================== **/

function ensureUserRaw(id: string): any {
  if (!raw.users) raw.users = {};
  const u = raw.users[id] ?? (raw.users[id] = { id });
  // normalize the presence of containers we use
  if (!u.aliases) u.aliases = [];
  if (!u.facts) u.facts = [];
  if (!u.prefs) u.prefs = {};
  if (!u.notes) u.notes = [];
  return u;
}

export function getUser(id: string): UserMemory {
  const u = ensureUserRaw(id);
  // derive lastSeenISO fallback
  const lastSeenISO = u.lastSeenISO ?? (u.lastSeen ? new Date(u.lastSeen).toISOString() : new Date(0).toISOString());
  return {
    id: u.id ?? id,
    aliases: Array.isArray(u.aliases) ? u.aliases : [],
    facts: Array.isArray(u.facts) ? u.facts : [],
    prefs: typeof u.prefs === "object" && u.prefs ? u.prefs : {},
    trust: typeof u.trust === "number" ? u.trust : 0,
    lastSeenISO,
    notes: Array.isArray(u.notes) ? u.notes : [],
    name: u.name,
    displayName: u.displayName,
    emotion: u.emotion,
    personaTier: u.personaTier,
    lastSeen: typeof u.lastSeen === "number" ? u.lastSeen : undefined,
    tags: Array.isArray(u.tags) ? u.tags : undefined,
    archived: typeof u.archived === "boolean" ? u.archived : undefined,
  };
}

export function touchUser(id: string, alias?: string) {
  const u = ensureUserRaw(id);
  const nowISO = new Date().toISOString();
  u.lastSeenISO = nowISO;
  u.lastSeen = Date.now();
  if (alias) {
    u.displayName ??= alias;
    u.name ??= alias;
    if (Array.isArray(u.aliases) && !u.aliases.includes(alias)) u.aliases.unshift(alias);
  }
  scheduleSave();
  return getUser(id);
}

export function addFact(id: string, fact: string, max = 50) {
  const u = ensureUserRaw(id);
  if (!u.facts.includes(fact)) {
    u.facts.unshift(fact);
    if (u.facts.length > max) u.facts = u.facts.slice(0, max);
  }
  scheduleSave();
}

export function setPref(id: string, key: string, val: any) {
  const u = ensureUserRaw(id);
  u.prefs[key] = val;
  scheduleSave();
}

export function getPref<T = any>(id: string, key: string, dflt?: T): T {
  const u = ensureUserRaw(id);
  return (u.prefs?.[key] ?? dflt) as T;
}

export function addTag(id: string, tag: string) {
  const u = ensureUserRaw(id);
  if (!Array.isArray(u.tags)) u.tags = [];
  if (!u.tags.includes(tag)) u.tags.push(tag);
  scheduleSave();
}

export function removeTag(id: string, tag: string) {
  const u = ensureUserRaw(id);
  if (!Array.isArray(u.tags)) return;
  u.tags = u.tags.filter((t: string) => t !== tag);
  scheduleSave();
}

export function adjustTrust(id: string, delta: number) {
  const u = ensureUserRaw(id);
  const cur = typeof u.trust === "number" ? u.trust : 0;
  u.trust = cur + delta;
  scheduleSave();
}

/** ============================== Guilds ============================== **/

function ensureGuildRaw(id: string): any {
  if (!raw.guilds) raw.guilds = {};
  const g = raw.guilds[id] ?? (raw.guilds[id] = { id });
  return g;
}

export function getGuild(id: string): GuildMemory {
  const g = ensureGuildRaw(id);
  return { id, name: g.name, memberCount: g.memberCount, joins: g.joins };
}

export function setGuildMemberCount(id: string, n: number) {
  const g = ensureGuildRaw(id);
  if (typeof n === "number" && n >= 0) g.memberCount = n;
  scheduleSave();
}

export function incGuildJoins(id: string) {
  const g = ensureGuildRaw(id);
  g.joins = (g.joins ?? 0) + 1;
  scheduleSave();
}
