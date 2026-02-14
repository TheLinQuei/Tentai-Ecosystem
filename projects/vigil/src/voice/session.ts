// src/voice/session.ts
type Awaiting = null | "location" | "confirmation" | { slot: string; hint?: string };

export type SessionState = {
  activeUntil: number;
  awaiting: Awaiting;
  lastIntent?: string;
};

const ACTIVE_WINDOW_MS = 15000; // 15s of follow-up without wake word
const sessions = new Map<string, SessionState>(); // key = `${guildId}:${userId}`

function key(guildId: string, userId: string) { return `${guildId}:${userId}`; }

export function wakeSession(guildId: string, userId: string) {
  const k = key(guildId, userId);
  sessions.set(k, { activeUntil: Date.now() + ACTIVE_WINDOW_MS, awaiting: null });
}

export function extendSession(guildId: string, userId: string) {
  const k = key(guildId, userId);
  const s = sessions.get(k);
  if (s) s.activeUntil = Date.now() + ACTIVE_WINDOW_MS;
}

export function endSession(guildId: string, userId: string) {
  sessions.delete(key(guildId, userId));
}

export function getSession(guildId: string, userId: string): SessionState | null {
  const s = sessions.get(key(guildId, userId));
  if (!s) return null;
  if (Date.now() > s.activeUntil) { sessions.delete(key(guildId, userId)); return null; }
  return s;
}

export function setAwaiting(guildId: string, userId: string, awaiting: Awaiting) {
  const s = getSession(guildId, userId);
  if (!s) return;
  s.awaiting = awaiting;
  s.activeUntil = Date.now() + ACTIVE_WINDOW_MS;
}
