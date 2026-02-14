// src/modules/longterm.ts
// Thin facade over memory for trust/tier/emotion while preserving legacy disk profiles (history/aliases)

import fs from "fs";
import path from "path";
import { deriveRelationship } from "./relationship.js";
import { memory } from "./memory"; // if ESM NodeNext at runtime, keep the .js

const profilesDir = path.join(process.cwd(), "memory", "profiles");
if (!fs.existsSync(profilesDir)) fs.mkdirSync(profilesDir, { recursive: true });

export interface UserProfile {
  id: string;
  name: string;
  displayName: string;
  trust: number;
  toneProfile: string;
  emotionalPattern: string;
  relationship: string;
  archetype: string;
  aliases: string[];
  history: { time: number; event: string; emotion: string }[];
}

function getProfilePath(userId: string): string {
  return path.join(profilesDir, `${userId}.json`);
}

/* ----------------------------- Safe shims over memory ----------------------------- */
type Snap = {
  id: string;
  name: string;
  trust: number;
  emotion: string;
  personaTier: "stranger" | "member" | "ally" | "rideOrDie";
  lastSeen: number;
} | null;

function memAny(): any { return memory as any; }

function getUserSnapshotSafe(userId: string): Snap {
  const m = memAny();
  if (typeof m.getUserSnapshot === "function") return m.getUserSnapshot(userId) ?? null;
  if (m.users?.get) return m.users.get(userId) ?? null;        // Map style
  if (m.users && m.users[userId]) return m.users[userId];       // Plain object style
  return null;
}

function getOrCreateUserSafe(userId: string, name: string) {
  const m = memAny();
  if (typeof m.getOrCreateUser === "function") return m.getOrCreateUser(userId, name);
  // Fallback seed
  let snap = getUserSnapshotSafe(userId) as any;
  if (!snap) {
    snap = { id: userId, name, trust: 0, emotion: "neutral", lastSeen: Date.now(), personaTier: "member" };
    if (m.users?.set) m.users.set(userId, snap);
    else {
      m.users = m.users || {};
      m.users[userId] = snap;
    }
  }
  return snap;
}

function renameUserSafe(userId: string, name: string) {
  const m = memAny();
  if (typeof m.renameUser === "function") return m.renameUser(userId, name);
  const s = getUserSnapshotSafe(userId) as any;
  if (s && name) s.name = name;
}

function bumpLastSeenSafe(userId: string) {
  const m = memAny();
  if (typeof m.bumpLastSeen === "function") return m.bumpLastSeen(userId);
  const s = getUserSnapshotSafe(userId) as any;
  if (s) s.lastSeen = Date.now();
}

function setTrustSafe(userId: string, newTrust: number) {
  const m = memAny();
  if (typeof m.setTrust === "function") return m.setTrust(userId, newTrust);
  let s = getUserSnapshotSafe(userId) as any;
  if (!s) s = getOrCreateUserSafe(userId, userId);
  s.trust = Math.max(-10, Math.min(10, newTrust));
}

function tryReadJSON<T = any>(p: string): T | null {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch (e) { console.warn("[longterm] read fail:", e); }
  return null;
}
function writeJSON(p: string, obj: any) {
  try { fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8"); }
  catch (e) { console.warn("[longterm] write fail:", e); }
}
function dominantNonNeutral(emotions: string[], fallback = "neutral"): string {
  const counts: Record<string, number> = {};
  for (const e of emotions) counts[(e || "neutral").toLowerCase()] = (counts[(e || "neutral").toLowerCase()] || 0) + 1;
  let max = 0, dom = fallback;
  for (const [emo, n] of Object.entries(counts)) if (emo !== "neutral" && n > max) { max = n; dom = emo; }
  return dom;
}

/* --------------------------------- API --------------------------------- */

/** Ensure a long-term profile exists for the user. Create one if missing. Also seed memory. */
export function ensureLongtermSchema(userId: string, name: string = "User"): void {
  const filePath = getProfilePath(userId);
  getOrCreateUserSafe(userId, name); // seed memory

  if (!fs.existsSync(filePath)) {
    const snap = getUserSnapshotSafe(userId);
    const profile: UserProfile = {
      id: userId,
      name: snap?.name || name,
      displayName: snap?.name || name,
      trust: snap?.trust ?? 0,
      toneProfile: "neutral",
      emotionalPattern: "neutral",
      relationship: deriveRelationship(snap?.trust ?? 0),
      archetype: "neutral",
      aliases: [],
      history: [],
    };
    writeJSON(filePath, profile);
  }
}

/** Retrieve a user's long-term profile from disk, merged with memory’s current trust/name. */
export function recall(userId: string): UserProfile | null {
  const filePath = getProfilePath(userId);
  const disk = tryReadJSON<UserProfile>(filePath);
  const snap = getUserSnapshotSafe(userId);

  if (!disk && !snap) return null;

  const base: UserProfile =
    disk ?? {
      id: userId,
      name: snap?.name || userId,
      displayName: snap?.name || userId,
      trust: snap?.trust ?? 0,
      toneProfile: "neutral",
      emotionalPattern: "neutral",
      relationship: deriveRelationship(snap?.trust ?? 0),
      archetype: "neutral",
      aliases: [],
      history: [],
    };

  const trust = snap?.trust ?? base.trust ?? 0;
  return {
    ...base,
    name: snap?.name ?? base.name,
    displayName: snap?.name ?? base.displayName,
    trust,
    relationship: deriveRelationship(trust),
  };
}

/** Append a user message event to their long-term history (disk) and bump memory lastSeen/name. */
export async function remember(userId: string, name: string, content: string, emotion: string): Promise<void> {
  ensureLongtermSchema(userId, name);
  const filePath = getProfilePath(userId);
  const profile = recall(userId)!; // ensured

  if (name) { getOrCreateUserSafe(userId, name); renameUserSafe(userId, name); }
  bumpLastSeenSafe(userId);

  if (name && profile.displayName && name !== profile.displayName) {
    profile.aliases = Array.from(new Set([...(profile.aliases || []), profile.displayName]));
    profile.displayName = name;
    profile.name = name;
  }

  profile.history = profile.history || [];
  profile.history.push({ time: Date.now(), event: content, emotion });
  if (profile.history.length > 100) profile.history.shift();

  const recent = profile.history.slice(-20).map((h) => h.emotion);
  profile.emotionalPattern = dominantNonNeutral(recent, profile.emotionalPattern || "neutral");

  const snap = getUserSnapshotSafe(userId);
  const trust = snap?.trust ?? profile.trust ?? 0;
  profile.trust = trust;
  profile.relationship = deriveRelationship(trust);

  writeJSON(filePath, profile);
}

/** Recalculate and update a user's tone profile based on their disk history. */
export function updateToneFromHistory(userId: string): void {
  const profile = recall(userId);
  if (!profile) return;
  const emotions = (profile.history || []).map((h) => h.emotion || "neutral");
  const dominant = dominantNonNeutral(emotions, profile.toneProfile || "neutral");
  profile.toneProfile = dominant === "neutral" ? profile.toneProfile : dominant;
  profile.emotionalPattern = dominant;
  writeJSON(getProfilePath(userId), profile);
}

/**
 * Update a user's trust value.
 * Canonical write goes to memory; mirrored into the disk profile for legacy readers.
 */
export function updateTrust(userId: string, newTrust: number): void {
  ensureLongtermSchema(userId);
  setTrustSafe(userId, newTrust); // canonical
  const profile = recall(userId);
  if (!profile) return;
  profile.trust = newTrust;
  profile.relationship = deriveRelationship(newTrust);
  writeJSON(getProfilePath(userId), profile);
}
