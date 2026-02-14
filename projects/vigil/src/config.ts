// src/config.ts
import "dotenv/config";

/* ───────────────────────── helpers ───────────────────────── */
function req(name: string): string {
  const v = process.env[name];
  if (v && v.trim()) return v.trim();
  throw new Error(`Missing required environment variable: ${name}`);
}
function str(name: string, def = ""): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : def;
}
function bool(name: string, def = false): boolean {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return def;
}
function int(name: string, def: number): number {
  const v = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(v) ? v : def;
}
function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/* ───────────────────────── config ───────────────────────── */
export const CONFIG = {
  NODE_ENV: str("NODE_ENV", "development"),

  // Discord
  DISCORD_TOKEN: req("DISCORD_TOKEN"),
  CLIENT_ID: str("DISCORD_CLIENT_ID"),
  TEST_GUILD_ID: str("TEST_GUILD_ID"),

  // AI (OpenAI)
  OPENAI_API_KEY: req("OPENAI_API_KEY"),
  // Primary model used if a module doesn’t override:
  OPENAI_MODEL: str("OPENAI_MODEL", "gpt-4o"),
  // Optional explicit model envs (used by modules/ai.ts router)
  OPENAI_MODEL_DEFAULT: str("OPENAI_MODEL_DEFAULT"),
  OPENAI_MODEL_4O: str("OPENAI_MODEL_4O", "gpt-4o"),
  OPENAI_MODEL_GPT5: str("OPENAI_MODEL_GPT5", ""), // leave blank if not available
  OPENAI_MODEL_4: str("OPENAI_MODEL_4", "gpt-4-turbo"),
  OPENAI_MODEL_35: str("OPENAI_MODEL_35", "gpt-3.5-turbo"),

  // Speech / TTS (optional; won’t crash if absent)
  ELEVENLABS_API_KEY: str("ELEVENLABS_API_KEY"),
  ELEVENLABS_VOICE_ID: str("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),
  GOOGLE_SPEECH_CREDENTIALS: str("GOOGLE_APPLICATION_CREDENTIALS"),
  GOOGLE_TTS_CREDENTIALS:
    str("GOOGLE_TTS_CREDENTIALS") || str("GOOGLE_APPLICATION_CREDENTIALS"),

  // Data stores
  DATABASE_URL: str("DATABASE_URL"),
  SQLITE_PATH: str("SQLITE_PATH", "./data/vi.db"),

  // Memory / brain
  MEMORY_FILE: str("MEMORY_FILE"),         // preferred explicit path
  VIBRAIN_PATH: str("VIBRAIN_PATH"),       // legacy/alt; modules will prefer MEMORY_FILE when set
  VIBRAIN_SNAPSHOT_PATH: str("VIBRAIN_SNAPSHOT_PATH", "./memory/vibrain.merged.backup.json"),

  // Runtime toggles
  DEBUG: bool("DEBUG", false),
  AI_DEBUG: bool("AI_DEBUG", false),       // append model name etc. in AI replies (modules/ai.ts respects)
  WAKE_WORD: str("WAKE_WORD", "vi").toLowerCase(),
  WAKE_WORD_ANYWHERE: bool("WAKE_WORD_ANYWHERE", true), // allow mid-sentence @vi detection

  // Histories / limits
  MAX_HISTORY_PER_CHANNEL: clamp(int("MAX_HISTORY_PER_CHANNEL", 20), 4, 200),

  // Live knowledge APIs (optional)
  WEATHER_API_KEY: str("WEATHER_API_KEY"),
  NEWS_API_KEY: str("NEWS_API_KEY"),
};

export * from "./core/config";

