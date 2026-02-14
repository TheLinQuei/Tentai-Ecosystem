// src/archetypes.ts

/**
 * Archetype configurations for personas. Each archetype may define special behaviors or style adjustments.
 */

export interface Archetype {
  /** Human-readable description shown in admin/diagnostic UIs. */
  description: string;

  /**
   * Optional text transforms applied to generated replies.
   * Keys are **RegExp patterns** (as strings), values are replacement strings.
   * They’re applied with the global flag in insertion order.
   */
  punctuationMap?: Record<string, string>;

  /**
   * Flags that can influence routing/behavior elsewhere (optional).
   * Example: "privileged" can change tone/guardrails for owners.
   */
  flags?: {
    privileged?: boolean;
    playful?: boolean;
    chaotic?: boolean;
  };
}

/** Canonical registry. Extend safely by adding new keys here. */
export const Archetypes: Record<string, Archetype> = {
  neutral: {
    description: "No particular archetype; balanced behavior.",
  },
  creator: {
    description: "Vi's creator; held in utmost esteem and trust.",
    // The "creator" archetype might get special treatment in responses.
    flags: { privileged: true },
  },
  chaotic: {
    description: "Unpredictable and unconventional personality.",
    punctuationMap: {
      // NOTE: keys are regex patterns (string form), replacements are literal
      "\\.\\.\\.": "—", // replace ellipsis with em dash
      "\\?": "⁇",       // replace question marks with double question marks
    },
    flags: { playful: true, chaotic: true },
  },
  // Additional archetypes can be added here.
} as const;

/** List known archetype names (useful for admin panels or validation). */
export function listArchetypes(): string[] {
  return Object.keys(Archetypes);
}

/** Resolve an archetype by name (case-insensitive). Falls back to "neutral". */
export function resolveArchetype(name?: string): Archetype {
  if (!name) return Archetypes.neutral;
  const key = name.trim().toLowerCase();
  return (Archetypes)[key] ?? Archetypes.neutral;
}

/**
 * Apply punctuation/style transforms defined by the archetype.
 * Safe no-op if none are configured.
 */
export function applyArchetypeStyle(text: string, archetypeName?: string): string {
  if (!text) return text;
  const a = resolveArchetype(archetypeName);
  const map = a.punctuationMap;
  if (!map) return text;

  let out = text;
  for (const [pattern, replacement] of Object.entries(map)) {
    try {
      const re = new RegExp(pattern, "g");
      out = out.replace(re, replacement);
    } catch {
      // Ignore invalid patterns to keep runtime safe.
      continue;
    }
  }
  return out;
}

/** Convenience: whether this archetype should be treated as privileged. */
export function isPrivilegedArchetype(name?: string): boolean {
  return !!resolveArchetype(name).flags?.privileged;
}
