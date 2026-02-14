// src/features/polls.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  Client,
  ChannelType,
  TextChannel,
  EmbedBuilder,
  PermissionFlagsBits as P,
} from "discord.js";

/* ========= CONFIG ========= */
const POLLS_CHANNEL_ID = process.env.POLLS_CHANNEL_ID ?? "";
const PINGS_CHANNEL_ID  = process.env.PINGS_CHANNEL_ID ?? ""; // fallback
const POLLS_UTC_HOUR    = Number(process.env.POLLS_UTC_HOUR ?? "17");
const POLLS_STATE_PATH  = process.env.POLLS_STATE_PATH ?? "./data/polls.state.json";
const POLLS_DURATION_MIN = Math.max(1, Number(process.env.POLLS_DURATION_MIN ?? "1440"));
const RECENT_WINDOW     = Number(process.env.POLLS_RECENT_WINDOW ?? "60"); // prevent repeats
const JITTER_MIN        = Math.max(0, Math.min(60, Number(process.env.POLLS_JITTER_MIN ?? "10")));
const LLM_ENABLED       = (process.env.POLLS_LLM_ENABLED ?? "1") === "1";
const LLM_MODEL         = process.env.POLLS_LLM_MODEL ?? "gpt-4o-mini"; // any JSON-capable fast model
const LLM_TIMEOUT_MS    = Number(process.env.POLLS_LLM_TIMEOUT_MS ?? "10000");
const LLM_RETRIES       = Number(process.env.POLLS_LLM_RETRIES ?? "2");

/* ========= TYPES ========= */
type Poll = { q: string; options: string[]; reactions?: string[]; theme?: string; image?: string };
type ActivePollMeta = {
  guildId: string;
  channelId: string;
  messageId: string;
  expiresAt: string; // ISO
  closed?: boolean;
  q?: string;
  theme?: string;
};

type State = {
  lastAt?: string;
  recent?: string[]; // recent hashes of (q+options) for uniqueness
  active?: ActivePollMeta; // current active poll for reaction guard/expiry
};

/* ========= UTILS ========= */
const THEME_STYLES = {
  wyr: { color: 0x5865F2, title: "🤔 Would You Rather?" },
  omg: { color: 0xED4245, title: "� ONE MUST GO" },
  vibe: { color: 0x57F287, title: "✨ Vibe Check" },
  yesno: { color: 0xFEE75C, title: "🗳️ Yes or No?" },
  multi: { color: 0xEB459E, title: "🎲 Multiple Choice" },
  rating: { color: 0xF26522, title: "⭐ Rate It!" },
  default: { color: 0x5865F2, title: "📊 Daily Poll" },
};
const FALLBACK_NUM = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const hsig = (p: Poll) => crypto.createHash("sha1").update((p.q.trim()+"|"+p.options.join("|")).toLowerCase()).digest("hex");
const ensureDir = (p: string) => fs.mkdirSync(path.dirname(p), { recursive: true });

// Module-level runtime helpers
let CURRENT_CLIENT: Client | null = null;
let expiryTimer: NodeJS.Timeout | null = null;
let reactionsWired = false;

export async function markPollClosed(client: Client, active: ActivePollMeta) {
  try {
    const ch = await client.channels.fetch(active.channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) return;
    const msg = await (ch).messages.fetch(active.messageId).catch(() => null);
    if (!msg) return;

    // edit embed to mark closed
    const orig = msg.embeds?.[0];
    const eb = new EmbedBuilder(orig?.data ?? {})
      .setFooter({ text: `⏱ Poll closed • ${new Date().toUTCString()}` });
    if (orig?.title && !orig.title.includes("Closed")) {
      eb.setTitle(`${orig.title} — Closed`);
    }
    await msg.edit({ embeds: [eb] }).catch(() => {});
    // try to remove reactions to prevent further voting
    await msg.reactions.removeAll().catch(() => {});
  } finally {
    const st = loadState();
    if (st.active && st.active.messageId === active.messageId) {
      st.active.closed = true;
      saveState(st);
    }
  }
}

function schedulePollExpiry(messageId: string, channelId: string, guildId: string, expiresAt: string, client?: Client) {
  const now = Date.now();
  const at = new Date(expiresAt).getTime();
  const delay = Math.max(0, at - now);
  if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = null; }
  const runner = async () => {
    const st = loadState();
    const meta = st.active && st.active.messageId === messageId ? st.active : { messageId, channelId, guildId, expiresAt } as ActivePollMeta;
    const c = client ?? CURRENT_CLIENT;
    if (c) await markPollClosed(c, meta).catch(() => {});
  };
  expiryTimer = setTimeout(runner, delay);
}

export function wireReactionGuard(client: Client) {
  if (reactionsWired) return; // only once
  reactionsWired = true;
  client.on("messageReactionAdd", async (rx, user) => {
    try {
      if ((user as any)?.bot) return;
      const st = loadState();
      const active = st.active;
      if (!active) return;
      if (rx.partial) await rx.fetch();
      const msg = rx.message;
      if (!msg.inGuild()) return;
      if (msg.id !== active.messageId || msg.channelId !== active.channelId) return;
      const expired = active.closed || Date.now() >= new Date(active.expiresAt).getTime();
      if (!expired) return;
      // remove the reaction to stop late votes
      await rx.users.remove(user.id).catch(() => {});
    } catch { /* ignore */ }
  });
}

function loadState(): State {
  try {
    const raw = fs.readFileSync(POLLS_STATE_PATH, "utf8");
    const s = JSON.parse(raw);
    return {
      lastAt: typeof s?.lastAt === "string" ? s.lastAt : undefined,
      recent: Array.isArray(s?.recent) ? s.recent : [],
      active: s?.active && typeof s.active === "object" && typeof s.active.messageId === "string"
        ? s.active as ActivePollMeta
        : undefined,
    };
  } catch { return { recent: [] }; }
}
function saveState(s: State) {
  try { ensureDir(POLLS_STATE_PATH); fs.writeFileSync(POLLS_STATE_PATH, JSON.stringify(s, null, 2)); }
  catch (e) { console.warn("[polls] failed to save state:", e); }
}

function validPoll(p: any): p is Poll {
  return !!p
    && typeof p.q === "string"
    && Array.isArray(p.options)
    && p.options.length >= 2
    && p.options.length <= 10
    && (!p.reactions || (Array.isArray(p.reactions) && p.reactions.length === p.options.length));
}

/* ========= LLM GEN ========= */
let openai: any = null;
async function ensureOpenAI() {
  if (openai || !LLM_ENABLED) return;
  try {
    // lazy import; don’t crash if missing key
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenAI = require("openai").default || require("openai");
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch {
    console.warn("[polls] OpenAI SDK not available or no API key; using fallback bank.");
  }
}

const SYSTEM_PROMPT = `
You are Vi, the vibrant Discord community bot creating ENGAGING, VISUAL, and FUN daily polls!

CRITICAL REQUIREMENTS:
1. **Image field** - Include an "image" field with a GIF URL
   - ⚠️ ONLY use these VERIFIED working URLs based on theme:
   
   **Veterans/Military/Patriotic:**
   - https://media.giphy.com/media/3o7aD2saQU8gE8gW6I/giphy.gif (salute)
   - https://media.giphy.com/media/l0HlMr2G3EKFgpUY0/giphy.gif (American flag)
   
   **Food/Choices:**
   - https://media.tenor.com/fKWKEgaphMYAAAAC/food-delicious.gif
   - https://media.tenor.com/MjJPu_lFkSAAAAAC/pineapple-pizza.gif
   
   **Thinking/Decisions:**
   - https://media.tenor.com/DnL82t39YB4AAAAC/thinking-confused.gif
   - https://media.tenor.com/1GmK8G0BFpMAAAAC/choices-decisions.gif
   
   **Mood/Vibe:**
   - https://media.tenor.com/b9_TW5PrmxYAAAAC/mood-feelings.gif
   - https://media.tenor.com/XhcJU8ZpEw0AAAAC/owl-night.gif
   
   **General/Celebratory:**
   - https://media.giphy.com/media/26tPqTOGf3MMAaJR6/giphy.gif (celebration)
   - https://media.giphy.com/media/g9582DNuQppxC/giphy.gif (party)
   
   - Pick the MOST RELEVANT URL from the list above - DO NOT make up new URLs
   - Match the URL to your poll's theme and topic
   
2. **Theme Selection** - Choose the BEST fit for your content:
   - "wyr" = Would You Rather (2 tough/impossible choices)
   - "omg" = ONE MUST GO (eliminate 1 from 3-4 beloved things)
   - "vibe" = Vibe Check (feelings, moods, identity, "which one are you?")
   - "yesno" = Yes/No (polarizing statements, hot takes)
   - "multi" = Multiple Choice (3-10 options, pick favorite)
   - "rating" = Rate It (1-5 scale with emoji ratings)

3. **Content Style** - Be Vi! Creative, playful, bold, slightly chaotic
   - Make questions that spark debate or self-reflection
   - Use pop culture, trends, relatable scenarios
   - Keep it SFW but NEVER boring
   - 2-10 options; keep them punchy and concise

4. **Special Occasions** - If seed mentions holidays/birthdays, LEAN INTO IT HARD
   - Celebrate the occasion with themed questions and imagery
   - Make it feel special and relevant

5. **Technical Rules**:
   - No events, scheduling, politics, NSFW, self-harm
   - "reactions" MUST BE STANDARD UNICODE EMOJI ONLY
   - ❌ NEVER use custom Discord emoji format like <:name:id> or <a:name:id>
   - ✅ ONLY use standard emoji like: 🎮 🎵 📺 📚 ❤️ 🔥 ✨ 🌟 etc.
   - Each reaction emoji must be 1-3 characters maximum
   - Output strict JSON: {"q":"...","options":["..."],"reactions":["🎮","🎵",...],"theme":"...","image":"REQUIRED_URL"}

EMOJI EXAMPLES (use ONLY these types):
✅ Food: 🍕 🍔 🌮 🍣 🍰 🍪
✅ Activities: 🎮 🎵 📺 📚 🎬 🎨
✅ Nature: 🌙 ☀️ ⭐ 🌈 🔥 💧
✅ Symbols: ❤️ ✨ 🔥 💀 👑 ⚔️
✅ Numbers: 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣
❌ NEVER: <:custom:123> or <a:animated:456>

Be amazing. Be Vi. Make polls people actually WANT to vote on!
`.trim();

function getHolidayContext(): string | null {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const day = now.getDate();
  
  // Major holidays (non-religious, universal)
  if (month === 1 && day === 1) return "🎉 New Year's Day - fresh starts, resolutions, new beginnings!";
  if (month === 2 && day === 14) return "💝 Valentine's Day - love, friendship, chocolates, romance!";
  if (month === 3 && day === 17) return "🍀 St. Patrick's Day - luck, green everything, Irish vibes!";
  if (month === 4 && day === 1) return "🤡 April Fools' Day - pranks, jokes, silly chaos!";
  if (month === 5 && day === 4) return "⭐ Star Wars Day (May the 4th) - sci-fi, space, the Force!";
  if (month === 7 && day === 4) return "🎆 Independence Day (US) - summer, fireworks, freedom!";
  if (month === 10 && day === 31) return "🎃 Halloween - spooky, costumes, candy, horror vibes!";
  if (month === 11 && day === 11) return "🇺🇸 Veterans Day - honoring service, sacrifice, heroes, military appreciation!";
  if (month === 11 && day === 28) return "🦃 Thanksgiving (approx) - gratitude, food, family, harvest!";
  if (month === 12 && day === 25) return "🎄 Christmas - winter holidays, gifts, celebration!";
  if (month === 12 && day === 31) return "🥳 New Year's Eve - parties, countdowns, fresh starts!";
  
  // Seasonal vibes
  if (month >= 3 && month <= 5) return "🌸 Spring Vibes - renewal, flowers, fresh energy!";
  if (month >= 6 && month <= 8) return "☀️ Summer Vibes - heat, vacations, outdoor fun!";
  if (month >= 9 && month <= 11 && day < 20) return "🍂 Fall Vibes - cozy, pumpkin spice, autumn colors!";
  if (month === 12 || month === 1 || month === 2) return "❄️ Winter Vibes - cold, cozy, snowflakes!";
  
  return null; // No specific holiday/season
}

function userPrompt(seed?: string) {
  const holiday = getHolidayContext();
  
  if (holiday) {
    return `TODAY'S SPECIAL: ${holiday} Create a poll celebrating this occasion! Use relevant imagery and questions.`;
  }
  
  const spices = [
    "ONE MUST GO with food, tech, or media.",
    "Identity vibes like Night Owl vs Early Bird.",
    "Would you rather with living, travel, or comfort.",
    "Game-adjacent genres without naming titles.",
    "Mood check with fun emojis.",
    "Silly bans (cursed snacks, forbidden toppings).",
    "Pop culture showdowns (genres, decades, vibes).",
    "Personality tests (how do you handle X?).",
  ];
  const s = seed ? `Seed: ${seed}` : `Ideas: ${spices.join(" | ")}`;
  return `Make it fresh, engaging, and VISUAL. ${s}`;
}

async function llmGenerateUnique(state: State, seed?: string): Promise<Poll | null> {
  console.log("[polls] llmGenerateUnique called, LLM_ENABLED:", LLM_ENABLED);
  if (!LLM_ENABLED) {
    console.log("[polls] LLM disabled, returning null");
    return null;
  }
  await ensureOpenAI();
  if (!openai) {
    console.log("[polls] OpenAI client not initialized, returning null");
    return null;
  }
  console.log("[polls] Calling OpenAI API with seed:", seed);

  const isUnique = (p: Poll) => {
    const sig = hsig(p);
    const recent = (state.recent ?? []).slice(-RECENT_WINDOW);
    return !recent.includes(sig);
  };

  for (let attempt = 0; attempt <= LLM_RETRIES; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);

      const resp = await openai.chat.completions.create({
        model: LLM_MODEL,
        temperature: 0.8,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt(seed) },
        ],
        response_format: { type: "json_object" },
      }, { signal: ctrl.signal as any });

      clearTimeout(timer);
      const text = resp.choices?.[0]?.message?.content ?? "";
      console.log("[polls] Raw LLM response:", text);
      const obj = JSON.parse(text);

      const poll: Poll = {
        q: String(obj.q ?? "").trim(),
        options: Array.isArray(obj.options) ? obj.options.map((x: any) => String(x)) : [],
        reactions: Array.isArray(obj.reactions) ? obj.reactions.map((x: any) => String(x)) : undefined,
        theme: obj.theme ? String(obj.theme) : undefined,
        image: obj.image && typeof obj.image === "string" ? obj.image : undefined,
      };

      // sanitize
      poll.options = poll.options
        .map(s => s.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 10);
      if (poll.reactions) {
        poll.reactions = poll.reactions
          .map(e => e.trim())
          .filter(Boolean)
          .slice(0, poll.options.length);
      }

      if (validPoll(poll) && isUnicodeEmojiSet(poll.reactions) && isUnique(poll)) {
        console.log("[polls] ✅ Generated valid unique poll from LLM:", poll.q);
        console.log("[polls] Poll details:", JSON.stringify(poll, null, 2));
        return poll;
      } else {
        console.log("[polls] ❌ Poll failed validation:", { 
          valid: validPoll(poll), 
          unicode: isUnicodeEmojiSet(poll.reactions), 
          unique: isUnique(poll),
          reactions: poll.reactions
        });
      }
    } catch (e: any) {
      if (e?.name === "AbortError") console.warn("[polls] LLM timeout");
      else console.warn("[polls] LLM error:", e?.message ?? e);
      // try again with a different seed
      seed = randomSeed();
    }
  }
  console.log("[polls] ⚠️ LLM generation failed after all retries, returning null");
  return null;
}

function isUnicodeEmojiSet(reactions?: string[]) {
  if (!reactions) return true; // allow fallback numbers later
  // reject custom <:name:id> or animated <a:...> and long strings
  return reactions.every(r => !r.includes("<:") && !r.includes("<a:") && r.length <= 3);
}

function randomSeed() {
  const seeds = [
    "ONE MUST GO: beloved foods/snacks",
    "Would you rather: impossible life choices",
    "Which one are you? Personality/vibes",
    "Hot takes: agree or disagree on controversial opinions",
    "Comfort picks: cozy vs chaos, snacks vs meals",
    "Media showdown: books vs movies vs games vs music",
    "Superpower fantasy: flight, invisibility, time travel, mind reading",
    "Animal kingdom: which creature represents you?",
    "Decade vibes: 80s, 90s, 2000s, 2010s nostalgia",
    "Food crimes: pineapple on pizza level debates",
    "Morning person vs night owl lifestyle",
    "City life vs nature escape preferences",
    "Dream vacation: beach, mountains, city, adventure",
    "Rate your mood today with emojis",
  ];
  return pick(seeds);
}

/* ========= FALLBACK MINI BANK ========= */
function fallbackPoll(): Poll {
  const bank: Poll[] = [
    { 
      q: "Which one are you?", 
      options: ["🌙 Night Owl","☀️ Early Bird"], 
      reactions: ["🌙","☀️"], 
      theme: "vibe",
      image: "https://media.tenor.com/XhcJU8ZpEw0AAAAC/owl-night.gif"
    },
    { 
      q: "ONE MUST GO:", 
      options: ["🍕 Pizza","🍔 Burgers","🌮 Tacos","🍣 Sushi"], 
      reactions: ["🍕","🍔","🌮","🍣"], 
      theme: "omg",
      image: "https://media.tenor.com/fKWKEgaphMYAAAAC/food-delicious.gif"
    },
    { 
      q: "Would you rather…", 
      options: ["🏝️ Live by the beach","🌆 Live in the city"], 
      reactions: ["🏝️","🌆"], 
      theme: "wyr",
      image: "https://media.tenor.com/DnL82t39YB4AAAAC/thinking-confused.gif"
    },
    { 
      q: "How's everyone feeling today?", 
      options: ["😀 Good","😐 Meh","😴 Tired","🔥 Hype"], 
      reactions: ["😀","😐","😴","🔥"], 
      theme: "vibe",
      image: "https://media.tenor.com/b9_TW5PrmxYAAAAC/mood-feelings.gif"
    },
    { 
      q: "You can only keep one", 
      options: ["🎮 Games","🎶 Music","📺 Movies","📚 Books"], 
      reactions: ["🎮","🎶","📺","📚"], 
      theme: "omg",
      image: "https://media.tenor.com/1GmK8G0BFpMAAAAC/choices-decisions.gif"
    },
    { 
      q: "Pineapple on pizza?", 
      options: ["✅ Absolutely YES","❌ NO WAY"], 
      reactions: ["✅","❌"], 
      theme: "yesno",
      image: "https://media.tenor.com/MjJPu_lFkSAAAAAC/pineapple-pizza.gif"
    },
  ];
  return pick(bank);
}

/* ========= RENDER ========= */
async function postPollToChannel(ch: TextChannel, poll: Poll) {
  const useReacts = poll.reactions && poll.reactions.length === poll.options.length && isUnicodeEmojiSet(poll.reactions);
  const options = useReacts ? poll.options : poll.options.slice(); // keep order if custom reacts supplied
  const reacts  = useReacts ? poll.reactions! : FALLBACK_NUM.slice(0, options.length);

  const lines = options.map((o, i) => `${reacts[i]} ${o}`);

  // Use theme-based styling if available
  const themeKey = poll.theme as keyof typeof THEME_STYLES | undefined;
  const theme = themeKey && THEME_STYLES[themeKey] ? THEME_STYLES[themeKey] : THEME_STYLES.default;

  const e = new EmbedBuilder()
    .setColor(theme.color)
    .setTitle(theme.title)
    .setDescription(`**${poll.q}**\n\n${lines.join("\n")}`)
    .setFooter({ text: `React to vote • ${new Date().toUTCString()}` });

  // Add image if provided - use full-size image for maximum visual impact
  if (poll.image) {
    console.log("[polls] Setting image on embed:", poll.image);
    try {
      e.setImage(poll.image);
      console.log("[polls] ✅ Image set successfully");
    } catch (err) {
      console.error("[polls] ❌ Failed to set image:", err);
    }
  } else {
    console.log("[polls] ⚠️ No image in poll object");
  }

  const msg = await ch.send({ embeds: [e] });
  for (let i = 0; i < reacts.length; i++) {
    try { await msg.react(reacts[i]); } catch { /* ignore invalid emoji */ }
  }

  // schedule closure
  const expiresAt = new Date(Date.now() + POLLS_DURATION_MIN * 60_000).toISOString();
  const st = loadState();
  saveState({ ...st, active: { guildId: ch.guild.id, channelId: ch.id, messageId: msg.id, expiresAt, q: poll.q, theme: poll.theme } });
  schedulePollExpiry(msg.id, ch.id, ch.guild.id, expiresAt);
}

/* ========= CHANNEL ========= */
async function getPollsChannel(client: Client): Promise<TextChannel | null> {
  const id = POLLS_CHANNEL_ID || PINGS_CHANNEL_ID;
  if (!id) return null;
  try {
    const ch = await client.channels.fetch(id);
    if (ch && ch.type === ChannelType.GuildText) return ch;
  } catch {}
  return null;
}

/* ========= CORE ========= */
async function generatePoll(state: State): Promise<Poll> {
  // Try LLM first
  const primary = await llmGenerateUnique(state, randomSeed());
  if (primary && validPoll(primary)) return primary;

  // Fallback
  const fb = fallbackPoll();
  return fb;
}

async function postOnePoll(client: Client) {
  const ch = await getPollsChannel(client);
  if (!ch) { console.warn("[polls] channel not configured/accessible"); return; }

  const me = await ch.guild.members.fetchMe();
  const perms = ch.permissionsFor(me);
  const needed = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AddReactions, P.ReadMessageHistory];
  const missing = needed.filter(p => !perms?.has(p));
  if (missing.length) { console.warn("[polls] missing perms:", missing); return; }

  const state = loadState();
  const now = new Date();

  // once-per-day guard
  if (state.lastAt) {
    const last = new Date(state.lastAt);
    const sameDay = last.getUTCFullYear() === now.getUTCFullYear()
      && last.getUTCMonth() === now.getUTCMonth()
      && last.getUTCDate() === now.getUTCDate();
    if (sameDay && process.env.POLLS_ALLOW_MULTIPLE_TODAY !== "1") {
      console.log("[polls] already posted today; skipping");
      return;
    }
  }

  let poll: Poll;
  try { poll = await generatePoll(state); }
  catch (e) {
    console.warn("[polls] generation failed; using fallback.", e);
    poll = fallbackPoll();
  }

  if (!validPoll(poll)) { console.warn("[polls] invalid poll from generator; aborting"); return; }

  try {
    await postPollToChannel(ch, poll);
  } catch (e) {
    console.warn("[polls] post failed:", e);
    return;
  }

  // update uniqueness history
  const sig = hsig(poll);
  const recent = (state.recent ?? []).concat(sig).slice(-RECENT_WINDOW);
  saveState({ lastAt: now.toISOString(), recent });
}

/* ========= SCHEDULER ========= */
function msUntilNextUtcHourWithJitter(h: number, jitterMin: number) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0, 0));
  if (now >= base) base.setUTCDate(base.getUTCDate() + 1);
  const jitter = Math.floor(Math.random() * (jitterMin * 60 * 1000)); // 0..jitterMin minutes
  return base.getTime() - now.getTime() + jitter;
}

export function initDailyPolls(client: Client) {
  // expose client for timers scheduled without explicit client (postPollToChannel)
  CURRENT_CLIENT = client;
  // ensure late-vote reaction guard is active
  wireReactionGuard(client);
  const t0 = msUntilNextUtcHourWithJitter(POLLS_UTC_HOUR, JITTER_MIN);
  console.log(`[polls] LLM=${LLM_ENABLED ? "on" : "off"}; first run in ${(t0/60000).toFixed(1)} min; then daily @ ${POLLS_UTC_HOUR}:00 UTC ±${JITTER_MIN}m`);
  // resume active poll expiry if present
  const st = loadState();
  if (st.active && !st.active.closed) {
    const expires = new Date(st.active.expiresAt).getTime();
    if (Date.now() >= expires) {
      // already expired; attempt to edit embed as closed if bot has access
      markPollClosed(client, st.active).catch(() => {});
    } else {
      schedulePollExpiry(st.active.messageId, st.active.channelId, st.active.guildId, st.active.expiresAt, client);
    }
  }
  setTimeout(async () => {
    try { await postOnePoll(client); } catch (e) { console.warn("[polls] first post error:", e); }
    setInterval(() => postOnePoll(client).catch(e => console.warn("[polls] post error:", e)), 86_400_000);
  }, t0);
}

/* ========= COMMAND HELPERS ========= */
export async function pollsPostNow(client: Client) { await postOnePoll(client); }
export function pollsStats() {
  const s = loadState();
  return {
    lastAt: s.lastAt ?? null,
    recentCount: (s.recent ?? []).length,
    hourUTC: POLLS_UTC_HOUR,
    jitterMin: JITTER_MIN,
    llmEnabled: LLM_ENABLED,
    model: LLM_MODEL,
  };
}
