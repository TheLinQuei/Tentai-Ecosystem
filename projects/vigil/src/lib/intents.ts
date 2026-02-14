// src/modules/intents.ts
// Works with both old and new memory implementations (safe shims)

import { memory } from "./memory.js"; // keep .js for NodeNext/ESM builds

// Tracks flagged intent per user (e.g., 'concern')
const intentFlags = new Map<string, "concern">();

/* ----------------------- safe shims over memory ----------------------- */
type PersonaTier = "stranger" | "member" | "ally" | "rideOrDie";
type Snap =
  | {
      id: string;
      name: string;
      trust: number;
      emotion?: string;
      personaTier: PersonaTier;
      lastSeen: number;
    }
  | null;

function getUserSnapshotSafe(userId: string): Snap {
  const m: any = memory as any;
  if (m && typeof m.getUserSnapshot === "function") {
    return m.getUserSnapshot(userId) ?? null;
  }
  if (m?.users && typeof m.users.get === "function") {
    return m.users.get(userId) ?? null;
  }
  return null;
}

function updateTrustSafe(userId: string, delta: number) {
  const m: any = memory as any;
  if (m && typeof m.updateTrust === "function") {
    m.updateTrust(userId, delta);
    return;
  }
  // Fallback: mutate known shape, clamp, re-derive tier
  const u = getUserSnapshotSafe(userId) as any;
  if (!u) return;
  u.trust = clamp((u.trust ?? 0) + delta, -10, 10);
  if (u.trust >= 8) u.personaTier = "rideOrDie";
  else if (u.trust >= 3) u.personaTier = "ally";
  else if (u.trust >= 0) u.personaTier = "member";
  else u.personaTier = "stranger";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
function count(str: string, re: RegExp): number {
  return (str.match(re) || []).length;
}

const OWNER_ENV_KEYS = ["OWNER_ID", "BOT_CREATOR_ID", "FORSA_ID", "BOT_OWNER_ID"];
function getOwnerId(): string | undefined {
  for (const k of OWNER_ENV_KEYS) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}
const OWNER_ID = getOwnerId();

/* ----------------------------- intents -------------------------------- */

/**
 * Analyze user's message content for specific intents (e.g., distress).
 * Non-destructive, idempotent flagging.
 */
export function formIntent(userId: string, content: string): void {
  if (!userId || !content) return;

  // Broader self-harm signal set; avoids common false-positives like "die laughing"
  const distressPattern =
    /\b(?:suicide|suicidal|kill\s*(?:myself|me)|end\s*my\s*life|(?:want|wanna|going)\s*to\s*die|wish(?:\s+i)?\s*(?:was|were)\s*dead|can['’]t\s*(?:go\s*on|do\s*this\s*anymore)|self[-\s]*harm|hurt\s*myself)\b/i;

  if (distressPattern.test(content)) {
    intentFlags.set(userId, "concern");
  }
}

/** Whether the user is currently flagged for an intervention. */
export function shouldIntervene(userId: string): boolean {
  return intentFlags.get(userId) === "concern";
}

/** A short intervention prompt when flagged (kept minimal; your responder can expand). */
export function getIntention(userId: string): string | null {
  if (intentFlags.get(userId) === "concern") {
    return "I’m here with you. If you’re in immediate danger, please contact local emergency services. Want to talk about what’s going on?";
  }
  return null;
}

/** Clear any flagged intent for the user. */
export function clearIntent(userId: string): void {
  intentFlags.delete(userId);
}

/**
 * If the user was disrespectful, generate a quick comeback (polite guard).
 * Returns a string if triggered, otherwise null.
 */
export function loyaltyGuard(userId: string, content: string): string | null {
  if (!content) return null;
  const lower = content.toLowerCase();
  const isInsult = /\b(?:fuck\s*you|you\s+suck|stupid|idiot|dumb|trash|shut\s*up)\b/.test(lower);
  if (!isInsult) return null;

  // Respect owner or high-trust users
  const u = getUserSnapshotSafe(userId);
  const trust = u?.trust ?? 0;
  if ((OWNER_ID && userId === OWNER_ID) || trust >= 5) return null;

  // Light, non-escalatory line
  return "There’s no need to be rude. I’m here to help.";
}

/** Determine if bot should withhold response (for very low-trust users). */
export function withholdResponse(userId: string): boolean {
  const u = getUserSnapshotSafe(userId);
  const trust = u?.trust ?? 0;
  return trust <= -5;
}

/**
 * Detect yelling or profanity spikes and reduce user trust accordingly.
 * Uses memory.updateTrust(...) (or shim) to persist + sync personaTier correctly.
 */
export function degradeTrustFromSpike(userId: string, content: string): void {
  if (!userId || !content) return;
  const lower = content.toLowerCase();
  let delta = 0;

  // Harsh profanity (heavier hit)
  if (/\b(?:fuck|cunt|whore|slut)\b/.test(lower)) {
    delta -= 2;
  } else if (/\b(?:shit|idiot|dumb|trash|you\s+suck)\b/.test(lower)) {
    delta -= 1;
  }

  // All-caps yelling for non-trivial length
  if (content.length > 10 && content === content.toUpperCase()) {
    delta -= 1;
  }

  // Excessive exclamation
  if (count(content, /!/g) > 3) {
    delta -= 1;
  }

  if (delta < 0) {
    updateTrustSafe(userId, delta);

    // Clamp again defensively (harmless if memory already clamps)
    const snap = getUserSnapshotSafe(userId);
    if (snap) snap.trust = clamp(snap.trust ?? 0, -10, 10);
  }
}

/** Very basic message sentiment classifier (for vibe evaluation). */
export function vibeEvaluator(content: string): string {
  if (!content) return "neutral";
  const text = content.toLowerCase();

  if (/[!@#$%^&*]/.test(text) && count(text, /!/g) > 1) {
    return "hostile";
  }
  if (/\b(?:love|thank)\b|❤️|❤|💕/.test(text)) {
    return "affectionate";
  }
  if (/\b(?:lol|haha|just kidding)\b/.test(text) || text.includes(":)")) {
    return "playful";
  }
  if (/[?.!]{2,}/.test(text)) {
    return "excited";
  }
  return "neutral";
}
