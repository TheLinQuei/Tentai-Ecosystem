// src/types.ts

// ───────────────────────────────
// Core enums / unions
// ───────────────────────────────
export type Emotion = "neutral" | "happy" | "sad" | "angry" | "anxious";

/** Canonical persona tiers (superset; includes 'risk' for low-trust cases). */
export type PersonaTier = "rideOrDie" | "ally" | "member" | "stranger" | "risk";

/** Back-compat alias used across older modules. */
export type RelationshipTier = PersonaTier;

// ───────────────────────────────
// User-facing profiles
// ───────────────────────────────

/**
 * High-level user profile used by adapters/features.
 * - `tier` kept for back-compat; `personaTier` is the canonical label.
 * - `username` (legacy) + `name`/`displayName` (current) coexist safely.
 */
export interface UserProfile {
  id: string;                                // Discord user id

  // Identity
  username?: string;                          // legacy
  name?: string;                              // preferred canonical
  displayName?: string;                       // UI-friendly label

  // Relationship / trust
  trust: number;                              // -10..+10 (clamped elsewhere)
  tier: RelationshipTier;                     // back-compat field (derived from trust)
  personaTier?: PersonaTier;                  // canonical field (derived from trust)

  // Mood
  dominantEmotion?: Emotion;                  // recent dominant signal
  emotionCounts?: Partial<Record<Emotion, number>>;

  // Activity / misc
  lastSeen: number;                           // epoch ms
  notes?: string;
}

/**
 * Server profile used by adapters/features.
 * Kept loose to avoid churn; more detailed meta lives in memory.getServerMeta(...).
 */
export interface ServerProfile {
  id: string;                 // Guild id
  nsfwAllowed?: boolean;      // optional for leniency with older data
  adminIds?: string[];        // legacy field
  ownerId?: string;           // optional convenience
  // add-ons may live in memory.getServerMeta(guildId)
}

// ───────────────────────────────
// Sessions / context
// ───────────────────────────────

export interface SessionMessage {
  userId: string;
  text: string;
  ts: number;
  emotion: Emotion;
}

export interface ChannelSession {
  channelId: string;
  history: SessionMessage[];
  speakerCounts: Record<string, number>;
  mood: Emotion;
}

/**
 * Context passed into AI routers. All parts are optional to allow
 * progressive population without strict coupling.
 */
export interface AIContext {
  user?: UserProfile;
  server?: ServerProfile;
  session?: ChannelSession;
}

// ───────────────────────────────
// Database adapter SPI
// ───────────────────────────────

export interface DBAdapter {
  init(): Promise<void>;
  upsertUser(u: UserProfile): Promise<void>;
  getAllUsers(): Promise<UserProfile[]>;
  upsertServer(s: ServerProfile): Promise<void>;
  getAllServers(): Promise<ServerProfile[]>;
}
