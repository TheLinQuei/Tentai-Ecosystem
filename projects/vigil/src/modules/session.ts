// src/modules/session.ts

type Awaiting = null | "location";
type Sess = { activeUntil: number; awaiting: Awaiting; lastPromptAt?: number };

const ACTIVE_WINDOW_MS = 15_000; // follow-up window
const sessions = new Map<string, Sess>();

function key(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

export function getSession(guildId: string, userId: string): Sess | null {
  const s = sessions.get(key(guildId, userId));
  if (!s) return null;
  if (Date.now() > s.activeUntil) {
    sessions.delete(key(guildId, userId));
    return null;
  }
  return s;
}

export function wakeSession(guildId: string, userId: string) {
  sessions.set(key(guildId, userId), {
    activeUntil: Date.now() + ACTIVE_WINDOW_MS,
    awaiting: null,
  });
}

export function extendSession(guildId: string, userId: string) {
  const s = getSession(guildId, userId);
  if (s) s.activeUntil = Date.now() + ACTIVE_WINDOW_MS;
}

export function setAwaiting(guildId: string, userId: string, field: Awaiting) {
  const s = getSession(guildId, userId);
  if (s) s.awaiting = field;
}

export function getAwaiting(guildId: string, userId: string): Awaiting {
  return getSession(guildId, userId)?.awaiting ?? null;
}

export function setLastPromptNow(guildId: string, userId: string) {
  const s = getSession(guildId, userId);
  if (s) s.lastPromptAt = Date.now();
}

export function shouldPromptAgain(guildId: string, userId: string, minMs = 5000) {
  const s = getSession(guildId, userId);
  if (!s) return true;
  return !s.lastPromptAt || Date.now() - s.lastPromptAt > minMs;
}
