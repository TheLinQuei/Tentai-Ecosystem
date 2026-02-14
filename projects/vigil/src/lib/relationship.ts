// src/lib/relationship.ts

export type PersonaTier = "rideOrDie" | "ally" | "member" | "stranger" | "risk";

/** Canonical tier order from lowest → highest trust. */
export const PERSONA_ORDER: readonly PersonaTier[] = [
  "risk",
  "stranger",
  "member",
  "ally",
  "rideOrDie",
] as const;

/** Clamp trust to the canonical range. */
export function clampTrust(trust: number | null | undefined, lo = -10, hi = 10): number {
  const n = Number(trust ?? 0);
  return Math.min(hi, Math.max(lo, n));
}

/** Map a trust score to a persona tier (unchanged thresholds). */
export function deriveRelationship(trust: number = 0): PersonaTier {
  const t = clampTrust(trust);
  if (t >= 8) return "rideOrDie";
  if (t >= 3) return "ally";
  if (t >= 0) return "member";
  if (t >= -2) return "stranger";
  return "risk";
}

/** Normalize any string-ish tier to a valid PersonaTier (fallback to 'member'). */
export function normalizeTier(input: unknown): PersonaTier {
  let s: string;
  if (typeof input === "string") s = input.trim();
  else if (typeof input === "number" || typeof input === "boolean") s = String(input).trim();
  else s = "";
  const key = s as PersonaTier;
  if ((PERSONA_ORDER as readonly string[]).includes(key)) return key;
  // common aliases
  const low = s.toLowerCase();
  if (/(best|core|owner|family|ride|die|ridedie|r_od)/.test(low)) return "rideOrDie";
  if (/(ally|friend|inner|close)/.test(low)) return "ally";
  if (/(member|default|neutral)/.test(low)) return "member";
  if (/(stranger|new|unknown)/.test(low)) return "stranger";
  if (/(risk|blocked|danger)/.test(low)) return "risk";
  return "member";
}

/** Rank of a tier (lower is worse). */
export function tierRank(tier: PersonaTier): number {
  return PERSONA_ORDER.indexOf(tier);
}

/** Higher of two tiers by trust rank. */
export function maxTier(a: PersonaTier, b: PersonaTier): PersonaTier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

/** Lower of two tiers by trust rank. */
export function minTier(a: PersonaTier, b: PersonaTier): PersonaTier {
  return tierRank(a) <= tierRank(b) ? a : b;
}

/** Nudge a tier up/down by steps (bounded to valid range). */
export function bumpTier(tier: PersonaTier, steps: number): PersonaTier {
  const i = tierRank(tier);
  const j = Math.min(PERSONA_ORDER.length - 1, Math.max(0, i + Math.trunc(steps || 0)));
  return PERSONA_ORDER[j];
}

/** Provide a representative trust value for a given tier (useful for seeding). */
export function tierToTrustHint(tier: PersonaTier): number {
  switch (tier) {
    case "rideOrDie": return 10;
    case "ally":      return 5;
    case "member":    return 0;
    case "stranger":  return -1;
    case "risk":      return -5;
  }
}
