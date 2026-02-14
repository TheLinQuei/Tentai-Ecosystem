import "dotenv/config";

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

export const CONFIG = {
  NODE_ENV: process.env.NODE_ENV || "development",
  DISCORD_TOKEN: required("DISCORD_TOKEN"),
  CLIENT_ID: process.env.DISCORD_CLIENT_ID || "",
  TEST_GUILD_ID: process.env.TEST_GUILD_ID || "",

  // AI and voice keys
  OPENAI_API_KEY: required("OPENAI_API_KEY"),
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4",
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",
  ELEVENLABS_VOICE_ID:
    process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
  GOOGLE_SPEECH_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
  GOOGLE_TTS_CREDENTIALS:
    process.env.GOOGLE_TTS_CREDENTIALS ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    "",

  // Databases: either Postgres or SQLite
  DATABASE_URL: process.env.DATABASE_URL || "",
  SQLITE_PATH: process.env.SQLITE_PATH || "./data/vi.db",

  DEBUG: (process.env.DEBUG || "false").toLowerCase() === "true",
  WAKE_WORD: (process.env.WAKE_WORD || "vi").toLowerCase(),
  MAX_HISTORY_PER_CHANNEL: Number(process.env.MAX_HISTORY_PER_CHANNEL || 20),

  // Live knowledge APIs
  WEATHER_API_KEY: process.env.WEATHER_API_KEY || "",
  NEWS_API_KEY: process.env.NEWS_API_KEY || "",
} as const;

export type AppConfig = typeof CONFIG;
