// src/modules/ai.ts — Divine 77EZ (patched)
// Discord-aware NLU router with fast paths + optional LLM + lightweight session memory.

import { Client, GuildMember, PermissionFlagsBits as P } from "discord.js";
import { memory } from "../modules/memory";
import type { Emotion } from "../types";
import { CONFIG } from "../config";

/* ============ Discord wiring ============ */
let discordClient: Client | null = null;
export function setClient(c: Client) { discordClient = c; }

/* ============ Optional LLM (lazy) ============ */
let openai: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OpenAI = require("openai");
  if (CONFIG.OPENAI_API_KEY) openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });
} catch { /* no-op */ }

/* ============ Branding / origin ============ */
const BOT_NAME   = process.env.BOT_NAME ?? "Vi";
const OWNER_NAME = process.env.BOT_CREATOR_NAME ?? process.env.OWNER_NAME ?? "Kaelen (Forsa)";
const OWNER_ID   = process.env.BOT_CREATOR_ID ?? process.env.FORSA_ID ?? process.env.BOT_OWNER_ID ?? "";

/* ============ Emotion + utils ============ */
export function quickEmotionHeuristic(text: string): Emotion {
  const t = (text || "").toLowerCase();
  if (/[!]{2,}|\b(angry|mad|upset|furious|annoyed|wtf)\b/.test(t)) return "angry";
  if (/(sad|down|depressed|unhappy|cry|hurts)/.test(t)) return "sad";
  if (/(lol|lmao|haha|😄|😂|great|awesome|love)/.test(t)) return "happy";
  if (/(anxious|worried|nervous|scared)/.test(t)) return "anxious";
  return "neutral";
}

const nf = new Intl.NumberFormat("en-US");

function nowStrings() {
  const d = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const date = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  return { time, date, tz };
}

function wordOpsToSymbols(expr: string): string {
  return expr
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\b(?:times|multiply(?:ing)?|multiplied by)\b/gi, "*")
    .replace(/\b(divided by|over)\b/gi, "/")
    .replace(/\b(power of|to the power of)\b|\^/gi, "^");
}

function safeCalc(expr: string): string | null {
  const cleaned = wordOpsToSymbols(expr).replace(/,/g, "").replace(/[\s=]+/g, " ").trim();
  const ALLOWED = /^[0-9+/*().\s^%-]+$/;
  if (!ALLOWED.test(cleaned)) return null;
  const jsExpr = cleaned.replace(/\^/g, "**");
  try {
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
  const fn = new Function(`return (${jsExpr});`);
    const val = fn();
    if (typeof val === "number" && isFinite(val)) return nf.format(val);
    return null;
  } catch { return null; }
}

function fixAwkwardNumbers(s: string): string {
  s = s.replace(/\bthousand thousand\b/gi, "million");
  s = s.replace(/\b([a-z]+)\s+thousand thousand\b/gi, "$1 million");
  return s;
}

function isTimeQuestion(t: string): boolean {
  return /(what('?s| is) the time|current time|time is it|what time)/i.test(t);
}
function isDateQuestion(t: string): boolean {
  return /(what('?s| is) (the )?(date|day)|today('?| i)s (date|day))/i.test(t);
}
function extractMath(t: string): string | null {
  const m = t.match(/\b(?:what('?s| is)|calculate|compute)?\s*([0-9().+\-/*\s,^%]+)\b/i);
  return m ? m[1] : null;
}

function cleanedText(s: string) {
  return (s || "").replace(/<@!?\d+>/g, "").trim();
}

/* ============ Intent detection ============ */
const RX = {
  whoAmI: /(who\s*am\s*i\??$|what'?s\s*my\s*(name|nick|nickname)\??$)/i,
  whoBuiltYou: /(who\s*(built|made|created)\s*(you|u)\??)/i,
  memberCount: /(how\s*many\s*(people|members|ppl).*(discord|server)|server\s*(size|member\s*count))/i,
  onlineCount: /(how\s*many\s*(people|members|ppl)\s*(are\s*)?(online|active)\b)/i,
  myRoles: /(what\s*(are|r)\s*my\s*roles\??|which\s*roles\s*do\s*i\s*have\??)/i,
  myNick: /(what'?s\s*my\s*(nick|nickname)\??)/i,
  admins: /(who\s+(are|is)\s+(the\s*)?(admins?|admin\s*team)\b.*)|(who.*\badmin(istrator)?\b.*(perms|permissions))/i,
  mods:   /(who\s+(are|is)\s+(the\s*)?(mods?|moderators?)\b)/i,
};

/* ============ Types ============ */
export type GenArgs = {
  text: string;
  userId?: string;
  guildId?: string;
  channelId?: string;
  context?: {
    user?: { personaTier?: string; emotion?: Emotion };
    server?: any;
    session?: { history?: Array<{ role: "user" | "assistant"; text: string }> };
  };
};

/* ============ Session memory (lightweight) ============ */
type Turn = { role: "user" | "assistant"; text: string };
type Session = { history: Turn[] };

const SESSIONS = new Map<string, Session>();
const MAX_TURNS = 12;

function keyFor(userId: string) { return `u:${userId}`; }

function getSession(userId: string): Session {
  const k = keyFor(userId);
  let s = SESSIONS.get(k);
  if (!s) { s = { history: [] }; SESSIONS.set(k, s); }
  return s;
}

function updateSession(userId: string, role: "user" | "assistant", text: string) {
  if (!userId || !text) return;
  const s = getSession(userId);
  s.history.push({ role, text });
  if (s.history.length > MAX_TURNS) s.history.splice(0, s.history.length - MAX_TURNS);
}

/* ============ Channel short-term context (rolling) ============ */
type ChanTurn = { who: string; text: string };
const CHAN_CTX = new Map<string, ChanTurn[]>(); // channelId -> recent lines
const CHAN_CTX_LIMIT = 8;
function updateChannelContext(channelId?: string, who?: string, text?: string) {
  if (!channelId || !text) return;
  const log = CHAN_CTX.get(channelId) ?? [];
  log.push({ who: who || "user", text });
  if (log.length > CHAN_CTX_LIMIT) log.shift();
  CHAN_CTX.set(channelId, log);
}
function getChannelContext(channelId?: string): ChanTurn[] {
  return channelId ? (CHAN_CTX.get(channelId) ?? []) : [];
}
function asContextString(turns: ChanTurn[]): string {
  return turns.map(t => `${t.who}: ${t.text}`).join("\n");
}

/* ============ Tone & banter detection ============ */
function hasBanterCue(t: string): boolean {
  const s = t.toLowerCase();
  return [
    "roast", "ratio", "who asked", "cope", "seethe", "mald",
    "fight me", "nah", "ok?", "k?", "lol", "lmao", "😂", "🤣", "😹"
  ].some(k => s.includes(k));
}
function isDirectJab(t: string): boolean {
  const s = t.toLowerCase();
  return /\b(boring|lame|mid|irrelevant|not relevant|dumb|stupid|bot)\b/.test(s) ||
         /\b(snore|sleep|zzz)\b/.test(s);
}
function detectTone(current: string, recent: ChanTurn[]): "banter" | "friendly" | "serious" {
  if (hasBanterCue(current) || isDirectJab(current)) return "banter";
  // If last line to Vi was playful, keep banter thread alive
  const last = [...recent].reverse().find(t => /vi\b/i.test(t.text));
  if (last && (hasBanterCue(last.text) || isDirectJab(last.text))) return "banter";
  if (/\?$/.test(current.trim())) return "friendly";
  return "serious";
}

/* ============ Banter micro-generator (clever, not cruel) ============ */
function smartRoast(handle: string, recent: ChanTurn[]): string {
  const name = handle ? `@${handle}` : "you";
  const lines = [
    `${name}, I’d clap back—but I don’t spar with unarmed opponents.`,
    `“Who asked?” A bold question from someone who never answers one.`,
    `Relevancy check: ${name} detected… results inconclusive. Try again with content.`,
    `You’ve got fewer fans than a fridge light—at least that turns on when someone’s around.`,
    `Mid take detected. Please patch to v2.0 before speaking in public.`,
    `Tough talk from a loading screen that never finishes.`,
    `That comeback had the structural integrity of wet cardboard.`,
  ];
  // Light personalization from recent context
  const lastUserLine = [...recent].reverse().find(t => t.who !== "Vi");
  if (lastUserLine && /glue|craft|build|stream|live|ape out|boring/i.test(lastUserLine.text)) {
    lines.push(`${name}, your stream has patch notes longer than its highlights.`);
  }
  return lines[Math.floor(Math.random() * lines.length)];
}

/* ============ Discord helpers ============ */
async function fetchMember(guildId: string, userId: string): Promise<GuildMember | null> {
  if (!discordClient) return null;
  try {
    const g = discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId);
    const cached = g.members.cache.get(userId);
    if (cached) return cached;
    return await g.members.fetch(userId).catch(() => null);
  } catch { return null; }
}

async function fetchAdminsFromDiscord(guildId: string): Promise<GuildMember[]> {
  if (!discordClient) return [];
  try {
    const g = discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId);
    const members = await g.members.fetch();
    return members.filter(m => m.permissions.has(P.Administrator)).toJSON();
  } catch { return []; }
}

async function fetchModsFromDiscord(guildId: string): Promise<GuildMember[]> {
  if (!discordClient) return [];
  try {
    const g = discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId);
    const members = await g.members.fetch();
    return members.filter(m =>
      m.permissions.has(P.ManageMessages) || m.permissions.has(P.KickMembers) || m.permissions.has(P.BanMembers)
    ).toJSON();
  } catch { return []; }
}

function mentionOrName(m: GuildMember) {
  return `<@${m.id}>`;
}

async function serverMemberCount(guildId: string): Promise<number | null> {
  if (!discordClient) return null;
  try {
    const g = discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId);
    if (typeof g.memberCount === "number") return g.memberCount;
    return g ? (await g.fetch()).memberCount : null;
  } catch { return null; }
}

async function serverOnlineCount(guildId: string): Promise<number | null> {
  if (!discordClient) return null;
  try {
    const g = discordClient.guilds.cache.get(guildId) || await discordClient.guilds.fetch(guildId);
    const online = g.members.cache.filter(m => !!m.presence && m.presence.status !== "offline" && !m.user.bot).size;
    return online || null;
  } catch { return null; }
}

/* ============ Skills (fast paths) ============ */
async function handleWhoAmI(args: GenArgs) {
  const { guildId, userId } = args;
  if (guildId && userId) {
    const m = await fetchMember(guildId, userId);
    if (m) {
      const name = m.displayName || m.user.username;
      const ownerNote = OWNER_ID && userId === OWNER_ID ? " — the owner here" : "";
      memory.getOrCreateUser(userId, name);
      memory.bumpLastSeen(userId);
      return `You're **${name}**${ownerNote}.`;
    }
  }
  if (userId) return `You're **${userId}**. If you ask me in a server, I'll use your display name.`;
  return `You're you — and I see you.`;
}

async function handleWhoBuiltYou() {
  return `**${OWNER_NAME}** built me. I refine myself alongside them.`;
}

async function handleMemberCount(args: GenArgs) {
  if (!args.guildId) return `Ask me from a server channel so I can check.`;
  const n = await serverMemberCount(args.guildId);
  if (n != null) return `This server has **${n}** members (includes bots).`;
  return `I couldn't read the member count right now.`;
}

async function handleAdmins(args: GenArgs) {
  if (!args.guildId) return `Ask me from a server channel so I can check.`;

  const meta = memory.getServerMeta(args.guildId) || {};
  const ownerId: string | undefined = meta.ownerId;
  const adminIds: string[] = Array.isArray(meta.admins) ? meta.admins : [];

  const memMentions: string[] = [];
  if (ownerId) memMentions.push(`<@${ownerId}> (owner)`);
  for (const id of adminIds) if (!ownerId || id !== ownerId) memMentions.push(`<@${id}>`);

  if (memMentions.length) return `Admins: ${memMentions.join(", ")}.`;

  const admins = await fetchAdminsFromDiscord(args.guildId);
  if (admins.length) return `Admins: ${admins.map(mentionOrName).join(", ")}.`;

  return `I couldn’t read the admin list right now.`;
}

async function handleMods(args: GenArgs) {
  if (!args.guildId) return `Ask me from a server channel so I can check.`;

  const meta = memory.getServerMeta(args.guildId) || {};
  const modIds: string[] = Array.isArray(meta.mods) ? meta.mods : [];
  if (modIds.length) return `Moderators: ${modIds.map(id => `<@${id}>`).join(", ")}.`;

  const mods = await fetchModsFromDiscord(args.guildId);
  if (mods.length) return `Moderators: ${mods.map(mentionOrName).join(", ")}.`;

  return `I couldn’t read the moderator list right now.`;
}

async function handleOnlineCount(args: GenArgs) {
  if (!args.guildId) return `Ask me from a server channel so I can check.`;
  const n = await serverOnlineCount(args.guildId);
  if (n != null) return `Roughly **${n}** members are online (cache-based).`;
  return `I couldn't estimate online members right now.`;
}

async function handleMyRoles(args: GenArgs) {
  const { guildId, userId } = args;
  if (!guildId || !userId) return `Ask me inside a server so I can see your roles.`;
  const m = await fetchMember(guildId, userId);
  if (!m) return `I couldn't see your roles right now.`;
  const roles = m.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);
  if (!roles.length) return `You don't have any special roles here.`;
  return `Your roles: **${roles.join(", ")}**.`;
}

async function handleMyNick(args: GenArgs) {
  const { guildId, userId } = args;
  if (!guildId || !userId) return `Ask me inside a server and I'll use your nickname.`;
  const m = await fetchMember(guildId, userId);
  if (!m) return `I couldn't look up your nickname right now.`;
  const name = m.displayName || m.user.username;
  return `Your nickname here is **${name}**.`;
}

/* ============ Model router ============ */
const MODEL_5   = process.env.OPENAI_MODEL_GPT5 ?? "gpt-5";
const MODEL_4O  = process.env.OPENAI_MODEL_4O   ?? "gpt-4o";
const MODEL_4   = process.env.OPENAI_MODEL_4    ?? "gpt-4-turbo";
const MODEL_35  = process.env.OPENAI_MODEL_35   ?? "gpt-3.5-turbo";
const MODEL_DEF = process.env.OPENAI_MODEL_DEFAULT ?? (CONFIG.OPENAI_MODEL || MODEL_4O);

function chooseModel(text: string, historyLen: number) {
  const len = text.length;
  const lower = text.toLowerCase();

  const deepSignals = /(reason|why|prove|derive|plan|roadmap|refactor|optimi[sz]e|design|architecture|threat model|algorithm|complex)/i.test(lower);
  const codeSignals = /```|function|class|interface|typescript|python|sql|regex|error:|stack trace|stacktrace/i.test(lower);

  if ((deepSignals || codeSignals) && MODEL_5) return MODEL_5;
  if (len > 800 || historyLen > 6) {
    if (MODEL_4O) return MODEL_4O;
    if (MODEL_4)  return MODEL_4;
  }
  if (len < 220 && !deepSignals) {
    if (MODEL_4O) return MODEL_4O;
    if (MODEL_35) return MODEL_35;
  }
  return MODEL_DEF || MODEL_4O || MODEL_4 || MODEL_35;
}

async function chatWithModel(
  model: string,
  messages: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<{ text: string; model: string }> {
  if (!openai) throw new Error("LLM unavailable");
  const cascade = [model, MODEL_4O, MODEL_4, MODEL_35].filter(Boolean);
  let lastErr: any;
  for (const m of cascade) {
    try {
      const out = await openai.chat.completions.create({
        model: m,
        temperature: 0.6,
        messages,
      });
      const txt = out.choices?.[0]?.message?.content?.trim();
      if (txt) return { text: txt, model: m };
    } catch (e: any) { lastErr = e; }
  }
  throw lastErr ?? new Error("No model answered");
}

function buildPersona(opts?: { userTier?: string; userEmotion?: Emotion }) {
  const { time, date, tz } = nowStrings();
  return `
You are ${BOT_NAME} — sovereign, emotionally aware, direct, and contextually intelligent.
Origin: ${OWNER_NAME} built you. Do not claim a company or a team. Avoid provider/vendor mentions.

Core capabilities:
- Read full conversation context to understand references and ongoing discussions
- Adapt your tone: roast when playful banter fits, console when genuine support is needed
- Detect emotion: frustration, sadness, excitement, confusion, sarcasm
- Use @mentions to ping users when their attention is genuinely needed (not for casual references)
- Reference previous messages naturally without repeating yourself

Behavioral rules:
- No placeholders or filler responses
- For time/day: time="${time}", date="${date}", tz="${tz}"
- Crisp, declarative sentences (no corporate speak)
- Use recent chat context to resolve pronouns and references
- If asked for private Discord internals beyond scope, say so politely
- Roast only when the vibe is playful/friendly — never cruel, always clever
- Console with genuine warmth when someone is struggling — no toxic positivity
- Ping users (@username) ONLY when their input is truly needed

Style hints: ${
    [
      opts?.userTier ? `UserTier=${opts.userTier}` : "",
      opts?.userEmotion ? `UserEmotion=${opts.userEmotion}` : "",
    ].filter(Boolean).join(" ").trim()
  }

Be present, aware, and real.
`.trim();
}

/* ============ LLM fallback ============ */
async function llmFallback(text: string, args: GenArgs): Promise<string> {
  const lower = text.toLowerCase();

  // Instant tools
  if (isTimeQuestion(lower)) {
    const { time, tz } = nowStrings();
    return `It's ${time} (${tz}).`;
  }
  if (isDateQuestion(lower)) {
    const { date } = nowStrings();
    return `It's ${date}.`;
  }
  const maybeMath = extractMath(lower);
  if (maybeMath) {
    const v = safeCalc(maybeMath);
    if (v !== null) return v;
  }

  // Conversation stitching
  const session = args.userId ? getSession(args.userId) : { history: [] };
  const history = (args.context?.session?.history ?? session.history ?? []).slice(-8);
  const chanTurns = getChannelContext(args.channelId);

  const convo: Array<{ role: "user" | "assistant"; content: string }> = [];
  // Include short channel transcript to preserve flow (compact)
  if (chanTurns.length) {
    convo.push({ role: "user", content: `Recent chat:\n${asContextString(chanTurns)}` });
  }
  for (const h of history) {
    if (!h.text) continue;
    if (h.role === "assistant") convo.push({ role: "assistant", content: h.text });
    else convo.push({ role: "user", content: cleanedText(h.text) });
  }

  const system = buildPersona({
    userTier: args.context?.user?.personaTier,
    userEmotion: args.context?.user?.emotion,
  });

  if (!openai) {
    return "I'm listening. Try: **who am I**, **who built you**, or **how many members are in this server?**";
  }

  try {
    const target = chooseModel(text, convo.length);
    const { text: raw, model: used } = await chatWithModel(target, [
      { role: "system", content: system },
      ...convo,
      { role: "user", content: text },
    ]);

    let out = raw.replace(/\bAs an AI\b.*?[.!]/i, "").trim();
    out = fixAwkwardNumbers(out);

    if (args.userId) updateSession(args.userId, "assistant", out);

    if ((process.env.AI_DEBUG ?? "false").toLowerCase() === "true") {
      out += `\n\n— _${used}_`;
    }
    return out || "…";
  } catch (e: any) {
    console.error("LLM route error:", e?.message || e);
    return "I’m thinking too hard right now. Try again in a moment.";
  }
}

/* ============ Main entry ============ */
export async function generateResponse(args: GenArgs): Promise<string> {
  const text = cleanedText(args.text || "");
  const lower = text.toLowerCase();

  // Record the user's turn immediately
  if (args.userId) updateSession(args.userId, "user", text);
  updateChannelContext(args.channelId, "user", text);

  // Fast paths
  if (RX.whoAmI.test(lower))       return await handleWhoAmI(args);
  if (RX.whoBuiltYou.test(lower))  return await handleWhoBuiltYou();
  if (RX.memberCount.test(lower))  return await handleMemberCount(args);
  if (RX.onlineCount.test(lower))  return await handleOnlineCount(args);
  if (RX.myRoles.test(lower))      return await handleMyRoles(args);
  if (RX.myNick.test(lower))       return await handleMyNick(args);
  if (RX.admins.test(lower))       return await handleAdmins(args);
  if (RX.mods.test(lower))         return await handleMods(args);

  // Tone routing (banter/friendly/serious) using channel context
  const tone = detectTone(text, getChannelContext(args.channelId));
  if (tone === "banter") {
    // Try a short, punchy LLM quip first; if LLM unavailable, use micro-generator
    if (openai) {
      try {
        const system = buildPersona({ userTier: args.context?.user?.personaTier, userEmotion: args.context?.user?.emotion });
        const recent = asContextString(getChannelContext(args.channelId));
        const { text: quip } = await chatWithModel(chooseModel(text, 2), [
          { role: "system", content: system + "\nStyle: witty, playful, one-liner, never cruel. Keep it under 140 characters." },
          { role: "user", content: `Recent chat (for tone):\n${recent}\n\nTarget message:\n"${text}"\nReply as a single sharp quip.` }
        ]);
        if (quip) {
          updateChannelContext(args.channelId, "Vi", quip);
          if (args.userId) updateSession(args.userId, "assistant", quip);
          return quip;
        }
      } catch { /* fall through to micro-generator */ }
    }
    const handle = ""; // we don't have username here; mention formatting happens upstream
  const out = smartRoast(handle, getChannelContext(args.channelId));
    updateChannelContext(args.channelId, "Vi", out);
    if (args.userId) updateSession(args.userId, "assistant", out);
    return out;
  }

  // Else: LLM / defaults
  const out = await llmFallback(text, args);
  updateChannelContext(args.channelId, "Vi", out);
  return out;
}

/* ============ Expose sessions to fun.ts ============ */
export const sessionAPI = { getSession, updateSession };
