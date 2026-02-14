// src/voice/wake.ts
type Sensitivity = "strict" | "default" | "lenient";

export interface WakeState {
  require: boolean;          // must say the wake alias to engage
  aliases: string[];         // e.g., ["vi","vee","vie","vii","v"]
  sensitivity: Sensitivity;  // edit distance tolerance
}

const DEFAULT_ALIASES = ["vi", "vee", "vie", "vii", "v", "vy", "vee-bot", "vi-bot"];
const DEFAULT_STATE: WakeState = {
  require: true,
  aliases: DEFAULT_ALIASES,
  sensitivity: "default",
};

// Per-guild runtime state (no DB). Fallback to env / defaults.
const state = new Map<string, WakeState>();
function getStateFor(guildId?: string): WakeState {
  if (!guildId) return DEFAULT_STATE;
  const s = state.get(guildId);
  if (s) return s;
  const require = (process.env.REQUIRE_WAKE_WORD || "true").toLowerCase() === "true";
  const envAliases = (process.env.WAKE_ALIASES || "").split(",").map(a => a.trim()).filter(Boolean);
  const aliases = envAliases.length ? envAliases : DEFAULT_ALIASES;
  const sensitivity = ((process.env.WAKE_SENSITIVITY || "default") as Sensitivity);
  const seeded: WakeState = { require, aliases, sensitivity };
  state.set(guildId, seeded);
  return seeded;
}

/* ======================= phonetic + distance ======================= */
function norm(s: string): string {
  return s.toLowerCase()
    .replace(/ph/g, "f").replace(/bh/g, "b").replace(/wh/g, "w")
    .replace(/[yij]/g, "i").replace(/[fv]/g, "v")
    .replace(/[bp]/g, "b").replace(/[ckq]/g, "k")
    .replace(/[^a-z0-9-]+/g, "");
}
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp: number[][] = Array.from({ length: m+1 }, () => Array(n+1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
    }
  }
  return dp[m][n];
}
function isAliasMatch(token: string, aliases: string[], sens: Sensitivity) {
  // single source of truth for tolerance:
  // strict => 1, default => 2, lenient => 3
  const tol = sens === "strict" ? 1 : sens === "lenient" ? 3 : 2;
  const t = norm(token);
  let best: { alias?: string; dist: number } | null = null;
  for (const a of aliases) {
    const d = levenshtein(t, norm(a));
    if (!best || d < best.dist) best = { alias: a, dist: d };
  }
  if (!best) return { ok: false };
  return { ok: best.dist <= tol, alias: best.alias, dist: best.dist };
}

const PREFIXES = new Set(["hey","ok","okay","yo","oi"]);
function splitWords(text: string): string[] {
  // keep hyphen in "vi-bot"
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);
}

/* ======================= public detection API ======================= */
export interface WakeDetectResult {
  wake: boolean;
  confidence: number;
  alias?: string;
  trimmed?: string;
  reason?: string;
}
export function detectWake(transcript: string, guildId?: string): WakeDetectResult {
  const cfg = getStateFor(guildId);
  const raw = (transcript || "").trim();
  if (!raw) return { wake: false, confidence: 0, reason: "empty" };
  const words = splitWords(raw);
  if (!words.length) return { wake: false, confidence: 0, reason: "no_words" };

  // 1) Allow "hey/ok/okay + alias"
  let idx = 0;
  if (words[0] && PREFIXES.has(words[0])) idx = 1;

  // 2) Try to match alias at the current position
  const first = words[idx] || "";
  const m = isAliasMatch(first, cfg.aliases, cfg.sensitivity);

  if (cfg.require) {
    if (!m.ok) return { wake: false, confidence: 0, reason: "require_not_matched" };
    const trimmed = words.slice(idx + 1).join(" ").trim();
    const conf = Math.max(0.6, 1 - (m.dist ?? 0) * 0.3) + (idx === 1 ? 0.1 : 0);
    return { wake: true, confidence: Math.min(conf, 1), alias: m.alias, trimmed, reason: "matched_required" };
  } else {
    if (m.ok) {
      const trimmed = words.slice(idx + 1).join(" ").trim();
      const conf = Math.max(0.6, 1 - (m.dist ?? 0) * 0.3) + (idx === 1 ? 0.1 : 0);
      return { wake: true, confidence: Math.min(conf, 1), alias: m.alias, trimmed, reason: "matched_optional" };
    }
    // No more "free talk" path — avoids random triggers
    return { wake: false, confidence: 0, reason: "no_alias_no_session" };
  }
}

