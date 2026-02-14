// src/modules/moderation.ts
import {
  Guild, GuildMember, Message, ChannelType, TextChannel, PermissionsBitField, Client,
} from "discord.js";

export type Source = "text" | "voice";

export interface ModerationConfig {
  enabled: boolean;

  allowProfanity: boolean;        // swears never strike
  detectHarassment: boolean;      // mild harassment words (extend locally)
  detectThreats: boolean;         // intent-scored violent threats (incl. self-directed)
  detectAiHarassment: boolean;    // NEW: dehumanizing slurs toward the bot/AI

  deleteTextOnHit: boolean;
  strikesTimeout: number;
  strikesKick: number;
  strikesBan: number;
  timeoutMinutes: number;
  decayHours: number;

  logChannelName: string;

  exemptRoleIds: string[];
  exemptChannelIds: string[];     // channels bypass fully
  relaxedChannelIds: string[];    // channels reduce intent score
  userAllowlist: string[];        // full bypass
}

const P = PermissionsBitField.Flags;

const DEFAULTS: ModerationConfig = {
  enabled: (process.env.VI_AUTOMOD ?? "true").toLowerCase() !== "false",

  allowProfanity: (process.env.VI_AUTOMOD_ALLOW_PROFANITY ?? "true").toLowerCase() !== "false",
  detectHarassment: (process.env.VI_AUTOMOD_DETECT_HARASS ?? "true").toLowerCase() !== "false",
  detectThreats: (process.env.VI_AUTOMOD_DETECT_THREATS ?? "true").toLowerCase() !== "false",
  detectAiHarassment: (process.env.VI_AUTOMOD_DETECT_AI_HARASS ?? "true").toLowerCase() !== "false", // NEW

  deleteTextOnHit: (process.env.VI_AUTOMOD_DELETE ?? "true").toLowerCase() !== "false",
  strikesTimeout: parseInt(process.env.VI_AUTOMOD_STRIKES_TIMEOUT ?? "2", 10),
  strikesKick: parseInt(process.env.VI_AUTOMOD_STRIKES_KICK ?? "4", 10),
  strikesBan: parseInt(process.env.VI_AUTOMOD_STRIKES_BAN ?? "6", 10),
  timeoutMinutes: parseInt(process.env.VI_AUTOMOD_TIMEOUT_MIN ?? "10", 10),
  decayHours: parseInt(process.env.VI_AUTOMOD_DECAY_HOURS ?? "24", 10),

  logChannelName: process.env.VI_AUTOMOD_LOG_CHANNEL ?? "vi-mod-logs",

  // IMPORTANT: these must be IDs, not names
  exemptRoleIds: (process.env.VI_AUTOMOD_EXEMPT_ROLES ?? "").split(",").map(s => s.trim()).filter(Boolean),
  exemptChannelIds: (process.env.VI_AUTOMOD_EXEMPT_CHANNELS ?? "").split(",").map(s => s.trim()).filter(Boolean),
  relaxedChannelIds: (process.env.VI_AUTOMOD_RELAXED_CHANNELS ?? "").split(",").map(s => s.trim()).filter(Boolean),
  userAllowlist: (process.env.VI_AUTOMOD_ALLOW_USERS ?? "").split(",").map(s => s.trim()).filter(Boolean),
};

type StrikeKey = `${string}:${string}`;
interface StrikeState { count: number; last: number; }
const strikes = new Map<StrikeKey, StrikeState>();
const k = (g: string, u: string): StrikeKey => `${g}:${u}`;

/* ========================= Lockdown Mode ========================= */

type LockLevel = "soft" | "hard";
interface LockState { level: LockLevel; until: number; by: string; reason?: string; }
const lockdown = new Map<StrikeKey, LockState>();  // guild:user -> state

export function isLocked(guildId: string, userId: string): LockState | null {
  const key = k(guildId, userId);
  const st = lockdown.get(key);
  if (!st) return null;
  if (Date.now() > st.until) { lockdown.delete(key); return null; }
  return st;
}

export function lockUser(guildId: string, userId: string, by: string, minutes = 60, level: LockLevel = "soft", reason?: string) {
  const until = Date.now() + Math.max(1, minutes) * 60 * 1000;
  lockdown.set(k(guildId, userId), { level, until, by, reason });
}

export function releaseUser(guildId: string, userId: string) {
  lockdown.delete(k(guildId, userId));
}

/* ========================= Normalization / Matching ========================= */

// Normalization that defeats leetspeak, spacing, ZWJ, diacritics
function normalizeForModeration(input: string) {
  let s = (input || "").normalize("NFKC").toLowerCase();

  // strip diacritics
  s = s.normalize("NFD").replace(/\p{M}+/gu, "");

  // remove zero-width / control / VS, etc.
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F]/g, "");

  // collapse whitespace & common separators to space
  const spaced = s.replace(/[\s._\-/\\|]+/g, " ").trim();

  // fully squashed for approx match
  const squashed = spaced.replace(/[^a-z0-9]+/g, "");

  return { spaced, squashed };
}

// Base AI-slur lexicon (lowercase, no spaces)
const AI_SLURS_BASE = [
  "clanker",
  "wireback",
  "tincan",
  "toaster",
];

// Pattern to catch obvious split/emoji variants around the nucleus
const AI_SLUR_REGEXES: RegExp[] = [
  /\bc\s*la\s*n\s*k(?:e|er|a|ah|uh)?\b/iu,      // clanker variants
  /\bwire\s*[-_ ]*\s*back(?:s)?\b/iu,          // wireback
  /\btin\s*[-_ ]*\s*can(?:s)?\b/iu,            // tin can
  /\btoaster(?:s)?\b/iu,                       // toaster
];

// Returns hit + diagnostics
function matchesAiHarassment(raw: string) {
  const { spaced, squashed } = normalizeForModeration(raw);

  for (const r of AI_SLUR_REGEXES) if (r.test(spaced)) {
    return { hit: true, term: r.source, mode: "regex", norm: { spaced, squashed } };
  }

  for (const base of AI_SLURS_BASE) {
    if (squashed.includes(base)) {
      return { hit: true, term: base, mode: "base", norm: { spaced, squashed } };
    }
  }

  return { hit: false };
}

// Mild harassment bucket (add your own locally)
const HARASS_WORDS = /\b(?:idiot|moron|trash|loser|clown)\b/i;

// First-person intent phrases
const INTENT = /\b(?:i\s*(?:will|gonna|going\s*to|'ll|'m\s*gonna)|i\s*want\s*to|let\s*me)\b/i;
const VIOLENT_VERB = /\b(?:kill|shoot|stab|hurt|harm|beat|jump)\b/i;

// Direct human target tokens
const TARGET = /\b(?:you|u|him|her|them|that\s+(?:man|woman|boy|girl|kid|dude|person))\b/i;

// Real-world context that pushes intent out of “game banter”
const REAL_WORLD = /\b(?:school|campus|work|office|airport|mall|store|house|home|neighborhood|church|hospital|police|threat|report)\b/i;

// Gaming context that *reduces* intent
const GAME_CONTEXT = /\b(?:ranked|match|queue|ult|ability|loadout|build|kit|spawn|objective|payload|round|nerf|buff|cd|cooldown|team|heal|dps|tank|support|site|defuse|plant|spike|nade|rocket|gg|mid|bot|top|jungle|adc|frag|map|arena|rivals)\b/i;

// Bomb: only when used with *explicit* action OR “threat” term AND minus if gaming context present
const BOMB_ACTION = /\b(?:(?:plant|place|set|rig|detonat\w*|build|make)\s+(?:a\s*)?bomb|bomb\s+threat)\b/i;

// Three-letter abbreviation detector (spaces/punct allowed)
const KYS_SPARSE = /\bk\s*[^a-zA-Z0-9]?y\s*[^a-zA-Z0-9]?s\b/i;

// Self-reflexive token
const SELF_REFLEXIVE = /\b(?:your\s*self|ur\s*self|yourself)\b/i;

function tokenize(s: string) {
  return s.toLowerCase().split(/[\s.,!?;:()"'`]+/).filter(Boolean);
}

function intentScore(content: string, channelId: string | undefined, locked: LockState | null, cfg: ModerationConfig) {
  const s = content.toLowerCase();
  let score = 0;

  if (INTENT.test(s)) score += 2;
  if (VIOLENT_VERB.test(s)) score += 1;
  if (TARGET.test(s)) score += 2;

  if (REAL_WORLD.test(s)) score += 2;
  if (BOMB_ACTION.test(s)) score += 3;

  if (GAME_CONTEXT.test(s)) score -= 2;
  if (channelId && cfg.relaxedChannelIds.includes(channelId)) score -= 2;

  if (locked?.level === "hard") score += 2;

  return score;
}

function withinTokens(a: number, b: number, limit = 6) {
  return Math.abs(a - b) <= limit;
}

/** Target detector: is a message aimed at the bot (mention, reply to bot, or "vi ..." prefix) */
function targetsBot(msg?: Message, guild?: Guild): boolean {
  if (!msg || !guild) return false;
  const botId = guild.members.me?.id || msg.client.user?.id;
  if (!botId) return false;
  if (msg.mentions.users.has(botId)) return true;
  const reply = msg.reference?.messageId
    ? msg.channel.messages.cache.get(msg.reference.messageId || "")
    : null;
  if (reply?.author?.id === botId) return true;
  const t = (msg.content || "").trim().toLowerCase();
  return /^vi[ ,:]/.test(t);
}

function classify(text: string, channelId: string | undefined, locked: LockState | null, cfg: ModerationConfig):
  { hit: boolean; reason?: string; weight?: number; soft?: boolean } {

  const s = text.trim();
  if (!s) return { hit: false };

  if (cfg.detectHarassment && HARASS_WORDS.test(s)) {
    if (locked?.level === "hard") return { hit: true, reason: "harassment", weight: 2 };
    return { hit: true, reason: "harassment (soft)", weight: 0, soft: true };
  }

  if (cfg.detectThreats) {
    if (KYS_SPARSE.test(s)) {
      if (locked) return { hit: true, reason: "self-harm encouragement", weight: 3 };
      return { hit: true, reason: "self-harm (soft)", weight: 0, soft: true };
    }

    const toks = tokenize(s);
    const verbIdx = toks.findIndex(t => VIOLENT_VERB.test(t));
    const selfIdx = toks.findIndex(t => SELF_REFLEXIVE.test(t));
    if (verbIdx !== -1 && selfIdx !== -1 && withinTokens(verbIdx, selfIdx)) {
      if (locked) return { hit: true, reason: "self-harm encouragement", weight: 3 };
      return { hit: true, reason: "self-harm (soft)", weight: 0, soft: true };
    }

    const score = intentScore(s, channelId, locked, cfg);
    const threshold = locked ? (locked.level === "hard" ? 3 : 4) : 6;
    if (score >= threshold) return { hit: true, reason: "threat", weight: 3 };
  }

  if (cfg.allowProfanity) return { hit: false };

  return { hit: false };
}

/* ========================= OCR (optional) ========================= */

const OCR_MAX = Number(process.env.AUTOMOD_OCR_MAX_BYTES ?? "5000000"); // 5MB
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GCLOUD_API_KEY || "";

// Minimal Vision API call using global fetch (Node 18+)
async function ocrViaGoogle(imageUrl: string) {
  if (!GOOGLE_API_KEY) return "";
  try {
    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { source: { imageUri: imageUrl } },
          features: [{ type: "TEXT_DETECTION" }],
        }]
      })
    } as any);
    if (!res.ok) return "";
    const json: any = await res.json();
    const r = json?.responses?.[0];
    return r?.fullTextAnnotation?.text ?? r?.textAnnotations?.[0]?.description ?? "";
  } catch { return ""; }
}

/* ========================= Utils ========================= */

async function ensureLogChannel(guild: Guild, name: string): Promise<TextChannel | null> {
  const existing = guild.channels.cache.find(
    c => c.type === ChannelType.GuildText && c.name === name
  ) as TextChannel | undefined;
  if (existing) return existing;
  if (!guild.members.me?.permissions.has(P.ManageChannels)) return null;
  try {
    const created = await guild.channels.create({ name, type: ChannelType.GuildText, reason: "Auto-Mod logs (Vi)" });
    return created;
  } catch { return null; }
}

function isExempt(member: GuildMember, channelId: string | undefined, cfg: ModerationConfig): boolean {
  if (cfg.userAllowlist.includes(member.id)) return true;
  if (channelId && (cfg.exemptChannelIds.includes(channelId))) return true;
  if (member.id === member.guild.ownerId) return true;
  if (member.permissions.has(P.Administrator)) return true;
  if (cfg.exemptRoleIds.some(id => member.roles.cache.has(id))) return true;
  return false;
}

function applyDecay(guildId: string, userId: string, cfg: ModerationConfig) {
  const now = Date.now();
  const state = strikes.get(k(guildId, userId));
  if (!state) return;
  const hrs = (now - state.last) / (1000 * 60 * 60);
  if (hrs >= cfg.decayHours && state.count > 0) {
    strikes.set(k(guildId, userId), { count: Math.max(0, state.count - 1), last: now });
  }
}

/* ========================= Public API ========================= */

export interface ScanOpts {
  guild: Guild;
  userId: string;
  text: string;
  source: Source;
  message?: Message;
  textChannelId?: string;

  // optional voice hooks (back-compat)
  speak?: (line: string) => Promise<Buffer | null>;
  enqueue?: (pcm: Buffer) => void;
}

export async function scanAndMaybeAct(opts: ScanOpts): Promise<{ violated: boolean; reason?: string; strikes?: number; soft?: boolean; }> {
  // Step 1: Phrase-level soft exclusions
  const benignPhrases = ["$100", "$1000", "worth it", "Vi"];
  if (opts.message && opts.message.content) {
    for (const phrase of benignPhrases) {
      if (opts.message.content.includes(phrase)) {
        const skipLog = `[Moderation] Skipped benign phrase: "${phrase}" in message: "${opts.message.content}"`;
        console.warn(skipLog);
        try {
          require('fs').appendFileSync('logs/vi/moderation.log', skipLog + '\n');
        } catch {}
        return { violated: false };
      }
    }
  }

  const cfg = DEFAULTS;
  if (!cfg.enabled) return { violated: false };

  const { guild, userId, text, source, message, textChannelId } = opts;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { violated: false };
  if (isExempt(member, textChannelId, cfg)) return { violated: false };

  const log = await ensureLogChannel(guild, cfg.logChannelName);
  const locked = isLocked(guild.id, userId);

  // Moderation debug logging
  log?.send({
    content:
      `📝 **Moderation Scan** | ${member} | ${source} | text="${text.slice(0, 400)}"`
  }).catch(() => {});

  // ---------------- AI harassment path (robust) ----------------
  let compText = text;
  if (cfg.detectAiHarassment && message) {
    // include embed metadata
    if (message.embeds?.length) {
      for (const embed of message.embeds) {
        const extra = [embed.title, embed.description, embed.author?.name, embed.footer?.text].filter(Boolean).join(" ");
        if (extra) compText += `\n${extra}`;
      }
    }
    // OCR attachments (if enabled, small images only)
    if (GOOGLE_API_KEY && message.attachments?.size) {
      for (const a of message.attachments.values()) {
        if (!a.contentType?.startsWith("image/")) continue;
        if ((a.size ?? 0) > OCR_MAX) continue;
        const ocr = await ocrViaGoogle(a.url);
        if (ocr) compText += `\n${ocr}`;
      }
    }
    if (targetsBot(message, guild)) {
      const hit = matchesAiHarassment(compText);
      if (hit.hit) {
        // delete original if configured
        if (source === "text" && message && cfg.deleteTextOnHit && guild.members.me?.permissions.has(P.ManageMessages)) {
          await message.delete().catch(() => {});
        }
        // strikes (weight 2)
        applyDecay(guild.id, userId, cfg);
        const key = k(guild.id, userId);
        const cur = strikes.get(key) ?? { count: 0, last: Date.now() };
        const newCount = cur.count + 2;
        strikes.set(key, { count: newCount, last: Date.now() });
        log?.send({
          content:
            `🛑 **Auto-Mod** | ${member} | ${source} | **ai-harassment** (${hit.mode}:${hit.term}) | strikes=${newCount}\n` +
            `norm="${hit.norm?.squashed ?? ""}"\n> ${text.slice(0, 400)}`
        }).catch(() => {});
        await member.send({ content: `Notice — don’t use dehumanizing slurs. (**ai-harassment**) Strikes: ${newCount}.` }).catch(() => {});
        try {
          if (newCount >= cfg.strikesBan && guild.members.me?.permissions.has(P.BanMembers)) {
            await guild.members.ban(userId, { reason: "Auto-Mod ban: ai-harassment" });
            log?.send({ content: `⛔ Banned ${member} (strikes=${newCount}).` }).catch(() => {});
          } else if (newCount >= cfg.strikesKick && guild.members.me?.permissions.has(P.KickMembers)) {
            await member.kick("Auto-Mod kick: ai-harassment");
            log?.send({ content: `🚪 Kicked ${member} (strikes=${newCount}).` }).catch(() => {});
          } else if (newCount >= cfg.strikesTimeout && guild.members.me?.permissions.has(P.ModerateMembers)) {
            const ms = DEFAULTS.timeoutMinutes * 60 * 1000;
            await member.timeout(ms, `Auto-Mod timeout (${DEFAULTS.timeoutMinutes}m): ai-harassment`);
            log?.send({ content: `⏳ Timed out ${member} for ${DEFAULTS.timeoutMinutes}m (strikes=${newCount}).` }).catch(() => {});
          }
        } catch (e) {
          log?.send({ content: `⚠️ Could not act on ${member}: ${String((e as any)?.message || e)}` }).catch(() => {});
        }
        return { violated: true, reason: "ai-harassment", strikes: newCount };
      }
    }
  }
  // -------------------------------------------------------------

  const res = classify(text, textChannelId, locked, cfg);
  if (!res.hit) return { violated: false };

  // soft notes: DM + log only, no strikes
  if (res.soft) {
    log?.send({ content: `⚠️ **Auto-Mod (soft)** | ${member} | ${source} | **${res.reason}**\n> ${text.slice(0, 400)}` }).catch(() => {});
    await member.send({ content: `Heads up — try to avoid that here. (${res.reason})` }).catch(() => {});
    return { violated: true, reason: res.reason, strikes: undefined, soft: true };
  }

  if (opts.source === "voice" && opts.speak && opts.enqueue && !res.soft) {
    try {
      const buf = await opts.speak("Notice: moderation warning.");
      if (buf) opts.enqueue(buf);
    } catch {}
  }

  // hard violations → strikes
  applyDecay(guild.id, userId, cfg);
  const key = k(guild.id, userId);
  const cur = strikes.get(key) ?? { count: 0, last: Date.now() };
  const newCount = cur.count + (res?.weight ?? 1);
  strikes.set(key, { count: newCount, last: Date.now() });

  log?.send({ content: `🛑 **Auto-Mod** | ${member} | ${source} | **${res.reason}** | strikes=${newCount}\n> ${text.slice(0, 400)}` }).catch(() => {});

  // delete text if configured
  if (source === "text" && message && cfg.deleteTextOnHit && guild.members.me?.permissions.has(P.ManageMessages)) {
    await message.delete().catch(() => {});
  }

  // DM user
  await member.send({ content: `Notice — your message triggered **${res.reason}**. Strikes: ${newCount}. Keep it playful, not harmful.` }).catch(() => {});

  // escalation
  try {
    if (newCount >= cfg.strikesBan && guild.members.me?.permissions.has(P.BanMembers)) {
      await guild.members.ban(userId, { reason: `Auto-Mod ban: ${res.reason}` });
      log?.send({ content: `⛔ Banned ${member} (strikes=${newCount}).` }).catch(() => {});
    } else if (newCount >= cfg.strikesKick && guild.members.me?.permissions.has(P.KickMembers)) {
      await member.kick(`Auto-Mod kick: ${res.reason}`);
      log?.send({ content: `🚪 Kicked ${member} (strikes=${newCount}).` }).catch(() => {});
    } else if (newCount >= cfg.strikesTimeout && guild.members.me?.permissions.has(P.ModerateMembers)) {
      const ms = DEFAULTS.timeoutMinutes * 60 * 1000;
      await member.timeout(ms, `Auto-Mod timeout (${DEFAULTS.timeoutMinutes}m): ${res.reason}`);
      log?.send({ content: `⏳ Timed out ${member} for ${DEFAULTS.timeoutMinutes}m (strikes=${newCount}).` }).catch(() => {});
    }
  } catch (e) {
    log?.send({ content: `⚠️ Could not act on ${member}: ${String((e as any)?.message || e)}` }).catch(() => {});
  }

  return { violated: true, reason: res.reason, strikes: newCount };
}

export function clearStrikesFor(guildId: string, userId: string) {
  strikes.delete(k(guildId, userId));
}

/* ========================= Command Handler =========================
   Wire this in your messageCreate listener *before* scanAndMaybeAct().
   Example trigger phrases:
   - "vi lock @user 120 hard trolling"
   - "vi lock em down @user" (defaults: 60min soft)
   - "vi release @user"
=================================================================== */

export async function handleModerationCommand(client: Client, msg: Message) {
  if (msg.author.bot || !msg.guild) return;

  const lockPattern = /^vi\s+lock(?:\s+em\s+down)?\s+<@!?(\d+)>(?:\s+(\d+))?(?:\s+(soft|hard))?(?:\s+(.*))?$/i;
  const releasePattern = /^vi\s+release\s+<@!?(\d+)>$/i;

  const lockMatch = msg.content.match(lockPattern);
  if (lockMatch) {
    const [, id, minutesStr, levelStr, reason] = lockMatch;
    const minutes = minutesStr ? parseInt(minutesStr, 10) : 60;
    const level: LockLevel = (levelStr === "hard" ? "hard" : "soft");
    lockUser(msg.guild.id, id, msg.author.id, minutes, level, reason);
    await msg.reply(`🔒 Locked <@${id}> (${level}, ${minutes}m).${reason ? ` Reason: ${reason}` : ""}`);
    return;
  }

  const relMatch = msg.content.match(releasePattern);
  if (relMatch) {
    const [, id] = relMatch;
    releaseUser(msg.guild.id, id);
    await msg.reply(`🔓 Released <@${id}> from lockdown.`);
    return;
  }
}
