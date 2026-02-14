// src/modules/memory.ts
import fs from "fs";
import path from "path";
import type { Client } from "discord.js";
import { CONFIG } from "../config";
import type { Emotion } from "../types";

export type Role = "user" | "assistant";

export interface HistoryEntry {
  role: Role;
  text: string;
  ts: number;
  userId?: string;
  emotion?: Emotion;
}

export interface SessionMem {
  id: string;
  history: HistoryEntry[]; // capped by CONFIG.MAX_HISTORY_PER_CHANNEL
}

export interface UserMem {
  id: string;
  name: string;
  trust: number;
  emotion: Emotion;
  personaTier: "stranger" | "member" | "ally" | "rideOrDie";
  lastSeen: number;
}

export interface ServerMem {
  id: string;
  name?: string;
}

/** Optional structured metadata we persist inside serverExtras */
export interface ServerMeta {
  ownerId?: string;
  admins?: string[];
  mods?: string[];
  [k: string]: any;
}

/* -------------------------- small utils -------------------------- */
function ensureDirFor(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function tryReadJson(p: string) {
  try {
    if (!p) return null;
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn(`[memory] Failed reading ${p}:`, e);
  }
  return null;
}

/* -------------------------- memory store ------------------------- */
class MemoryStore {
  users = new Map<string, UserMem>();
  servers = new Map<string, ServerMem>();
  sessions = new Map<string, SessionMem>();

  // expose merged metadata that was preserved during load
  getServerMeta(id: string): Record<string, any> | undefined {
    return this.serverExtras.get(id);
  }
  /** Same as getServerMeta, but always returns an object with sane defaults */
  getServerMetaSafe(id: string): ServerMeta {
    const meta = (this.serverExtras.get(id) || {}) as ServerMeta;
    if (!Array.isArray(meta.admins)) meta.admins = [];
    if (!Array.isArray(meta.mods)) meta.mods = [];
    return meta;
  }

  getUserSnapshot(id: string) {
    return this.users.get(id);
  }

  /** Preserve unknown/original fields here so we can save them back losslessly */
  private userExtras = new Map<string, Record<string, any>>();
  private serverExtras = new Map<string, Record<string, any>>();

  /** Flags: e.g., creator/owner */
  private flags = new Map<string, Set<string>>();

  /** where we read/write the brain */
  private filePath: string | null = null;

  /** autosave debounce */
  private dirty = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly AUTOSAVE_MS = 10_000;

  private tierFromTrust(trust: number): UserMem["personaTier"] {
    if (trust >= 8) return "rideOrDie";
    if (trust >= 3) return "ally";
    if (trust >= 0) return "member";
    return "stranger";
  }

  /** Try multiple well-known paths, prefer explicit envs. */
  private resolvePath(): string {
    const envPath = process.env.MEMORY_FILE || process.env.VIBRAIN_PATH;
    if (envPath) return path.resolve(envPath);
    // prefer ./memory/vibrain.json (your current) then legacy ./data/vibrain.json
    const preferred = path.resolve(process.cwd(), "memory", "vibrain.json");
    const legacy    = path.resolve(process.cwd(), "data", "vibrain.json");
    if (fs.existsSync(preferred)) return preferred;
    if (fs.existsSync(legacy)) return legacy;
    return preferred; // default target if none exist yet
  }

  /** Normalize a raw user record + capture extras */
  private mapUser(id: string, raw: any): UserMem {
    const trust = Number(raw?.trust ?? 0);
    const persona: UserMem["personaTier"] =
      (raw?.personaTier && ["stranger","member","ally","rideOrDie"].includes(raw.personaTier))
        ? raw.personaTier
        : this.tierFromTrust(trust);

    const emotion = (raw?.emotion || raw?.dominantEmotion || raw?.tone || "neutral") as Emotion;
    const name = raw?.displayName || raw?.username || raw?.name || id;
    const lastSeen = Number(raw?.lastSeen ?? Date.now());

    // store extras (lossless) — remove normalized keys from the clone
    const extras: Record<string, any> = { ...(raw || {}) };
    delete extras.trust;
    delete extras.emotion;
    delete extras.dominantEmotion;
    delete extras.tone;
    delete extras.name;
    delete extras.username;
    delete extras.displayName;
    delete extras.lastSeen;
    delete extras.personaTier;

    this.userExtras.set(id, extras);

    return { id, name, trust, emotion, lastSeen, personaTier: persona };
  }

  private mapServer(id: string, raw: any): ServerMem {
    const name = raw?.name ?? undefined;
    const extras: Record<string, any> = { ...(raw || {}) };
    delete extras.name;
    this.serverExtras.set(id, extras);
    return { id, name };
  }

  async loadAll() {
    const p = this.resolvePath();
    this.filePath = p;

    const data = tryReadJson(p);
    if (!data) {
      console.log("Memory loaded: 0 users, 0 servers (empty)");
      return;
    }

    // Users
    const users = data.users ?? {};
    for (const [id, u] of Object.entries<any>(users)) {
      this.users.set(id, this.mapUser(id, u));
    }

    // Servers
    const servers = data.servers ?? {};
    for (const [id, s] of Object.entries<any>(servers)) {
      this.servers.set(id, this.mapServer(id, s));
    }

    // Sessions (keep as-is but normalize)
    const sessions = data.sessions ?? {};
    for (const [id, sess] of Object.entries<any>(sessions)) {
      const hist = Array.isArray(sess.history) ? sess.history : [];
      this.sessions.set(id, {
        id,
        history: hist.map((h: any) => ({
          role: (h.role === "assistant" ? "assistant" : "user") as Role,
          text: String(h.text ?? ""),
          ts: Number(h.ts ?? Date.now()),
          userId: h.userId,
          emotion: h.emotion ?? undefined,
        })),
      });
    }

    console.log(`Memory loaded: ${this.users.size} users, ${this.servers.size} servers from ${p}`);
  }

  /** Save a merged snapshot that preserves unknown fields (lossless). */
  async saveAll() {
    try {
      if (!this.filePath) this.filePath = this.resolvePath();
      const outUsers: Record<string, any> = {};
      for (const [id, u] of this.users) {
        const extras = { ...(this.userExtras.get(id) ?? {}) };
        outUsers[id] = {
          // canonical fields
          name: u.name,
          trust: u.trust,
          emotion: u.emotion,
          lastSeen: u.lastSeen,
          personaTier: u.personaTier,
          // a convenience duplicate lots of UIs expect
          displayName: u.name,
          // merged extras (owner flags, tags, etc.)
          ...extras,
        };
      }

      const outServers: Record<string, any> = {};
      for (const [id, s] of this.servers) {
        const extras = { ...(this.serverExtras.get(id) ?? {}) };
        outServers[id] = { name: s.name, ...extras };
      }

      const out = { users: outUsers, servers: outServers, sessions: Object.fromEntries(this.sessions) };
      ensureDirFor(this.filePath);
      fs.writeFileSync(this.filePath, JSON.stringify(out, null, 2), "utf8");
      this.dirty = false;
    } catch (e) {
      console.warn("[memory] save failed:", e);
    }
  }

  /** Merge-patch server meta without clobbering unknown keys. */
  updateServerMeta(id: string, patch: Partial<ServerMeta>) {
    const current = (this.serverExtras.get(id) || {}) as ServerMeta;
    const next: ServerMeta = { ...current, ...patch };
    // normalize arrays
    if (patch.admins) next.admins = Array.from(new Set((patch.admins || []).filter(Boolean)));
    if (patch.mods)   next.mods   = Array.from(new Set((patch.mods   || []).filter(Boolean)));
    this.serverExtras.set(id, next);
    this.markDirty();
  }
  setOwner(id: string, ownerId?: string) {
    if (!id) return;
    const meta = this.getServerMetaSafe(id);
    meta.ownerId = ownerId;
    this.serverExtras.set(id, meta);
    this.markDirty();
  }
  setAdminSnapshot(id: string, adminIds: string[]) {
    if (!id) return;
    const meta = this.getServerMetaSafe(id);
    meta.admins = Array.from(new Set((adminIds || []).filter(Boolean)));
    this.serverExtras.set(id, meta);
    this.markDirty();
  }
  setModSnapshot(id: string, modIds: string[]) {
    if (!id) return;
    const meta = this.getServerMetaSafe(id);
    meta.mods = Array.from(new Set((modIds || []).filter(Boolean)));
    this.serverExtras.set(id, meta);
    this.markDirty();
  }

  /** Write to a different file (e.g., backups) without changing main path. */
  saveSnapshot(targetPath: string) {
    try {
      const prev = this.filePath ?? this.resolvePath();
      const original = tryReadJson(prev) ?? {};
      const tmp = {
        users: {} as Record<string, any>,
        servers: {} as Record<string, any>,
        sessions: {} as Record<string, any>,
      };

      // rebuild merged structure from current state
      for (const [id, u] of this.users) {
        const extras = { ...(this.userExtras.get(id) ?? {}) };
        tmp.users[id] = {
          name: u.name,
          trust: u.trust,
          emotion: u.emotion,
          lastSeen: u.lastSeen,
          personaTier: u.personaTier,
          displayName: u.name,
          ...extras,
        };
      }
      for (const [id, s] of this.servers) {
        const extras = { ...(this.serverExtras.get(id) ?? {}) };
        tmp.servers[id] = { name: s.name, ...extras };
      }
      for (const [id, sess] of this.sessions) tmp.sessions[id] = sess;

      // If original had fields we don't track at the root, keep them
      const out = { ...original, ...tmp };
      ensureDirFor(targetPath);
      fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), "utf8");
      console.log(`[memory] snapshot saved to ${targetPath}`);
    } catch (e) {
      console.warn("[memory] snapshot failed:", e);
    }
  }

  private markDirty() {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      if (this.dirty) this.saveAll().catch(() => {});
    }, this.AUTOSAVE_MS);
  }

  /* ---------------------- public helpers (stable) ---------------------- */
  getOrCreateUser(id: string, name: string): UserMem {
    const existing = this.users.get(id);
    if (existing) return existing;
    const u: UserMem = {
      id, name, trust: 0, emotion: "neutral", lastSeen: Date.now(),
      personaTier: "member",
    };
    this.users.set(id, u);
    this.markDirty();
    return u;
  }
  renameUser(id: string, name: string) {
    const u = this.users.get(id);
    if (!u) return;
    if (name && name !== u.name) {
      u.name = name;
      this.markDirty();
    }
  }
  bumpLastSeen(id: string) {
    const u = this.users.get(id);
    if (u) { u.lastSeen = Date.now(); this.markDirty(); }
  }
  updateEmotion(id: string, emotion: Emotion) {
    const u = this.users.get(id);
    if (!u) return;
    u.emotion = emotion;
    this.markDirty();
  }
  updateTrust(id: string, delta: number) {
    const u = this.users.get(id);
    if (!u) return;
    u.trust = Math.max(-10, Math.min(10, u.trust + delta));
    u.personaTier = this.tierFromTrust(u.trust);
    this.markDirty();
  }
  setTrust(id: string, value: number) {
    const u = this.users.get(id);
    if (!u) return;
    u.trust = Math.max(-10, Math.min(10, value));
    u.personaTier = this.tierFromTrust(u.trust);
    this.markDirty();
  }

  /** Read-only helpers for persona tier */
  getPersonaTier(id: string): UserMem["personaTier"] | undefined {
    return this.users.get(id)?.personaTier;
  }
  setPersonaTier(id: string, tier: UserMem["personaTier"]) {
    const u = this.users.get(id);
    if (!u) return;
    u.personaTier = tier;
    // keep trust roughly aligned (non-destructive)
    const target = tier === "rideOrDie" ? 10 : tier === "ally" ? 5 : tier === "member" ? 0 : -1;
    if (typeof u.trust === "number") {
      if (tier === "rideOrDie") u.trust = Math.max(u.trust, target);
      else if (tier === "ally") u.trust = Math.max(u.trust, target);
      else if (tier === "member") u.trust = Math.min(u.trust, Math.max(u.trust, target));
      else if (tier === "stranger") u.trust = Math.min(u.trust, 0);
    }
    this.markDirty();
  }

  getOrCreateServer(id: string, name?: string): ServerMem {
    let s = this.servers.get(id);
    if (!s) {
      s = { id, name };
      this.servers.set(id, s);
      this.markDirty();
    }
    return s;
  }

  getOrCreateSession(id: string): SessionMem {
    let s = this.sessions.get(id);
    if (!s) {
      s = { id, history: [] };
      this.sessions.set(id, s);
      this.markDirty();
    }
    return s;
  }

  /** Backward-compatible: if role missing, assume 'user'. */
  pushHistory(sessionId: string, entry: Partial<HistoryEntry> & { text: string; ts?: number }) {
    const s = this.getOrCreateSession(sessionId);
    const item: HistoryEntry = {
      role: (entry.role as Role) || "user",
      text: entry.text,
      ts: entry.ts ?? Date.now(),
      userId: entry.userId,
      emotion: entry.emotion,
    };
    s.history.push(item);
    const max = Math.max(4, CONFIG.MAX_HISTORY_PER_CHANNEL || 20);
    if (s.history.length > max) s.history.splice(0, s.history.length - max);
    this.markDirty();
  }
  pushAssistant(sessionId: string, text: string) {
    this.pushHistory(sessionId, { role: "assistant", text });
  }
  getRecentHistory(sessionId: string, n = 12): HistoryEntry[] {
    const s = this.getOrCreateSession(sessionId);
    const start = Math.max(0, s.history.length - n);
    return s.history.slice(start);
  }
  clearSession(sessionId: string) {
    const s = this.getOrCreateSession(sessionId);
    s.history = [];
    this.markDirty();
  }
  trimSession(sessionId: string, max = Math.max(4, CONFIG.MAX_HISTORY_PER_CHANNEL || 20)) {
    const s = this.getOrCreateSession(sessionId);
    if (s.history.length > max) {
      s.history.splice(0, s.history.length - max);
      this.markDirty();
    }
  }

  /* ---------------------- extras & admin helpers ----------------------- */
  /** Permanently mark a user as the creator/owner. */
  ensureCreator(userId: string, displayName?: string) {
    const u = this.users.get(userId) ?? {
      id: userId, name: displayName || userId, trust: 10, emotion: "neutral" as Emotion,
      personaTier: "rideOrDie" as const, lastSeen: Date.now(),
    };
    u.trust = Math.max(u.trust, 10);
    u.personaTier = "rideOrDie";
    if (displayName) u.name = displayName;
    this.users.set(userId, u);

    const f = this.flags.get(userId) ?? new Set<string>();
    f.add("creator");
    this.flags.set(userId, f);

    const extras = this.userExtras.get(userId) ?? {};
    if (!extras.tags) extras.tags = [];
    if (!extras.tags.includes("creator")) extras.tags.push("creator");
    this.userExtras.set(userId, extras);

    this.markDirty();
  }
  isCreator(userId: string) { return this.flags.get(userId)?.has("creator") ?? false; }

  /** Remove/Archive users not present in a guild (useful when folks leave). */
  async pruneUsersNotInGuild(client: Client, guildId: string, opts?: { archive?: boolean }) {
    try {
      const g = await client.guilds.fetch(guildId);
      const members = await g.members.fetch();
      const present = new Set(members.map(m => m.id));
      let removed = 0, archived = 0;

      for (const uid of [...this.users.keys()]) {
        if (!present.has(uid)) {
          if (opts?.archive) {
            const ex = this.userExtras.get(uid) ?? {};
            ex.archived = true;
            this.userExtras.set(uid, ex);
            archived++;
          } else {
            this.users.delete(uid);
            this.userExtras.delete(uid);
            removed++;
          }
        }
      }
      if (removed || archived) this.markDirty();
      console.log(`[memory] prune (${g.name}): removed=${removed}, archived=${archived}`);
    } catch (e) {
      console.warn("[memory] prune failed:", e);
    }
  }
}

export const memory = new MemoryStore();

/* Legacy handlers removed - now handled by src/core/shutdown.ts graceful shutdown */
