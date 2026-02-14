// src/voice/router.ts
import { detectWake } from "./wake";

/**
 * Strip leading wake phrase (if present) and tell the caller if we woke.
 * Usage:
 *   const r = stripWakePrefix(text, guildId);
 *   if (r.woke) { /* start/extend session */ /* }
 *   const content = r.text; // safe remainder
 */
export function stripWakePrefix(raw: string, guildId?: string): { text: string; woke: boolean } {
  const t = (raw || "").trim();
  if (!t) return { text: "", woke: false };

  const det = detectWake(t, guildId);
  if (det.wake) {
    return { text: (det.trimmed || "").trim(), woke: true };
  }
  return { text: t, woke: false };
}
