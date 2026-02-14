import {
  Client, Colors, EmbedBuilder, Message,
  ChatInputCommandInteraction
} from 'discord.js';

/* OPTIONAL LIBS (no top-level await) */
let FilterCtor: any | undefined;
let winkSentiment: any | undefined;
let filter: any | undefined;
function loadOptionalLibs() {
  try {
    const m = require('bad-words'); FilterCtor = m?.default ?? m; filter = new FilterCtor();
  } catch {}
  try {
    const m = require('wink-sentiment'); winkSentiment = m?.default ?? m;
  } catch {}
}

/* CONFIG */
const ENABLED      = (process.env.GUARDIAN_ENABLED ?? 'false').toLowerCase() === 'true';
const OWNER_ID     = process.env.GUARDIAN_OWNER_ID ?? process.env.BOT_OWNER_ID ?? process.env.FORSA_ID!;
const DM_COOLDOWN  = Number(process.env.GUARDIAN_DM_COOLDOWN_MS ?? '300000'); // 5m
const MAX_HOURLY   = Number(process.env.GUARDIAN_MAX_ALERTS_PER_HOUR ?? '6');
const GUILD_ALLOW  = new Set((process.env.GUARDIAN_GUILDS ?? '').split(',').map(s => s.trim()).filter(Boolean));
const IGNORE_INIT  = new Set((process.env.GUARDIAN_IGNORE_CHANNELS ?? '').split(',').map(s => s.trim()).filter(Boolean));
const OFFLINE_PUSH = (process.env.GUARDIAN_OFFLINE_PUSH ?? 'true').toLowerCase() === 'true';

const COL = { info: Colors.Blue, warn: Colors.Orange, danger: Colors.Red };

/* runtime */
const disabledGuilds = new Set<string>();
const ignoreByGuild  = new Map<string, Set<string>>();
const lastDMByKey = new Map<string, number>();
const hourlyBucket: Record<string, { ts: number; n: number }> = {};
const seenMessage = new Set<string>();
const ownerRecentInChannel = new Map<string, number>();
const OWNER_RECENT_MS = 60_000 * 15;

/* patterns */
const THREAT_PATTERNS: RegExp[] = [
  /\b(kys|kill\s*yourself|unalive\s*yourself)\b/i,
  /\b(i['\s]*m\s+going\s+to\s+(?:find|doxx|swat|hurt|attack))\b/i,
  /\b(?:hope\s+you\s+die|i['\s]*ll\s+kill\s+you)\b/i,
];
const INSULT_PATTERNS: RegExp[] = [
  /\b(?:idiot|moron|dumb(?:ass)?|stupid|clown|loser)\b/i,
];
const SELF_HARM_PATTERNS: RegExp[] = [
  /\b(?:i\s+want\s+to\s+die|i\s+wish\s+i\s+wasn['’]t\s+alive|kill\s*myself)\b/i,
  /\b(?:goodbye\s+everyone|no\s+point\s+anymore)\b/i,
];

function now() { return Date.now(); }
function key(...parts: (string|number|undefined)[]) { return parts.filter(Boolean).join('|'); }
function cooldownOk(k: string, ms = DM_COOLDOWN) {
  const t = lastDMByKey.get(k) ?? 0;
  if (now() - t < ms) return false; lastDMByKey.set(k, now()); return true;
}
function hourlyOk(k: string) {
  const hour = Math.floor(now() / 3_600_000);
  if (!hourlyBucket[k] || hourlyBucket[k].ts !== hour) hourlyBucket[k] = { ts: hour, n: 0 };
  if (hourlyBucket[k].n >= MAX_HOURLY) return false; hourlyBucket[k].n += 1; return true;
}

function isDirectedAtOwner(m: Message) {
  if (m.mentions.users.has(OWNER_ID)) return true;
  if (m.reference && m.mentions.repliedUser?.id === OWNER_ID) return true;
  const owner = m.client.users.cache.get(OWNER_ID);
  const tag = owner?.username?.toLowerCase() ?? '';
  if (tag && m.content.toLowerCase().includes(tag)) return true;
  const recent = ownerRecentInChannel.get(m.channelId) ?? 0;
  if (now() - recent <= OWNER_RECENT_MS) return true;
  return false;
}

function toxicityScore(text: string) {
  let score = 0;
  if (filter && filter.isProfane(text)) score += 1;
  if (THREAT_PATTERNS.some(rx => rx.test(text))) score += 2;
  if (INSULT_PATTERNS.some(rx => rx.test(text))) score += 1;
  if (winkSentiment) {
    const s = winkSentiment(text);
    if (s?.score <= -2) score += 1;
    if (s?.emotion?.anger) score += 1;
    if (s?.emotion?.disgust) score += 1;
  }
  return Math.min(score, 5);
}
function moodScore(text: string) {
  let score = 0;
  if (SELF_HARM_PATTERNS.some(rx => rx.test(text))) score += 3;
  if (winkSentiment) {
    const s = winkSentiment(text);
    if (s?.score < -2) score += 1;
    if (s?.emotion?.sadness || s?.emotion?.anger || s?.emotion?.fear) score += 1;
  } else if (/\b(i['’]?\s*m|i am)\s+(sad|tired|mad|upset|not\s+ok|empty)\b/i.test(text)) {
    score += 1;
  }
  return Math.min(score, 4);
}

async function dmOwner(
  ctx: Message | ChatInputCommandInteraction,
  title: string,
  body: string,
  severity: keyof typeof COL = 'warn'
) {
  try {
    const client = ctx.client;
    const me = await client.users.fetch(OWNER_ID);
    const guildName   = (ctx as any).guild?.name ?? 'DM';
    const channelName = (ctx as any).channel?.name ?? (ctx as any).channelId ?? 'unknown';
    const ts: Date    = (ctx as any).createdAt ?? new Date();
    const url: string | undefined = (ctx as any).url;

    const e = new EmbedBuilder()
      .setColor(COL[severity])
      .setTitle(title)
      .setDescription(body)
      .setFooter({ text: `${guildName} • #${channelName}` })
      .setTimestamp(ts);

    await me.send({ embeds: [e], ...(url ? { content: url } : {}) });
  } catch {}
}

/* listener */
const GUARD_WIRED = Symbol.for('vi.guardian.wired');

export function initGuardian(client: Client) {
  if (!ENABLED || !OWNER_ID) return;
  if ((client as any)[GUARD_WIRED]) return;
  (client as any)[GUARD_WIRED] = true;

  loadOptionalLibs();

  client.on('ready', () => {
    for (const g of client.guilds.cache.values()) {
      if (!ignoreByGuild.has(g.id)) ignoreByGuild.set(g.id, new Set());
      const set = ignoreByGuild.get(g.id)!;
      IGNORE_INIT.forEach(x => set.add(x));
    }
  });

  client.on('messageCreate', (m) => {
    if (m.author.id === OWNER_ID && m.inGuild()) {
      ownerRecentInChannel.set(m.channelId, now());
      if (ownerRecentInChannel.size > 500) {
        for (const [cid, ts] of ownerRecentInChannel) {
          if (now() - ts > OWNER_RECENT_MS * 4) ownerRecentInChannel.delete(cid);
        }
      }
    }
  });

  client.on('messageCreate', async (m) => {
    try {
      if (!m.inGuild() || m.author.bot) return;
      if (GUILD_ALLOW.size && !GUILD_ALLOW.has(m.guildId)) return;
      if (disabledGuilds.has(m.guildId)) return;

      const ign = ignoreByGuild.get(m.guildId) ?? new Set<string>();
      if (ign.has(m.channelId) || ign.has((m.channel as any)?.name)) return;

      if (seenMessage.has(m.id)) return;
      seenMessage.add(m.id);
      if (seenMessage.size > 2000) {
        const it = seenMessage.values();
        for (let i = 0; i < 500; i++) {
          const v = it.next(); if (v.done) break; seenMessage.delete(v.value);
        }
      }

      const content = m.content ?? '';
      const isOwner = m.author.id === OWNER_ID;

      if (isOwner) {
        const mood = moodScore(content);
        if (mood >= 3) {
          const k = key('mood-hi', m.guildId);
          if (cooldownOk(k, DM_COOLDOWN) && hourlyOk(k)) {
            const help =
              "If you're not feeling safe, consider reaching out to someone you trust. " +
              "You can also message me **/note add** to privately jot thoughts.";
            await dmOwner(m, 'Checking in 💙', `Your message felt heavy:\n> ${content.slice(0, 500)}\n\n${help}`, 'danger');
          }
        } else if (mood === 2) {
          const k = key('mood', m.guildId);
          if (cooldownOk(k, DM_COOLDOWN) && hourlyOk(k)) {
            await dmOwner(m, 'You okay?', `Just checking in. This sounded low:\n> ${content.slice(0, 500)}\n\nNeed to offload? Try **/note add** or ping me here.`);
          }
        }
        return;
      }

      if (isDirectedAtOwner(m)) {
        const tox = toxicityScore(content);
        if (tox >= 3) {
          const k = key('dir-hi', m.guildId);
          if (cooldownOk(k) && hourlyOk(k)) {
            await dmOwner(m, 'Heads-up: likely harassment', `**From:** <@${m.author.id}>\n> ${content.slice(0, 500)}\n\nI’ll stay quiet publicly unless you say otherwise.`, 'danger');
          }
        } else if (tox === 2) {
          const k = key('dir', m.guildId);
          if (cooldownOk(k) && hourlyOk(k)) {
            await dmOwner(m, 'Potentially harmful message', `**From:** <@${m.author.id}>\n> ${content.slice(0, 500)}`);
          }
        }
      }

      const ambientThreat = THREAT_PATTERNS.some(rx => rx.test(content)) || SELF_HARM_PATTERNS.some(rx => rx.test(content));
      if (ambientThreat) {
        let offlineBoost: boolean = false;
        if (OFFLINE_PUSH) {
          try {
            const me = await m.guild.members.fetch(OWNER_ID);
            offlineBoost = !!me?.presence?.status && me.presence.status !== 'online';
          } catch {}
        }
        const k = key('ambient', m.guildId);
        if (cooldownOk(k, offlineBoost ? DM_COOLDOWN / 2 : DM_COOLDOWN) && hourlyOk(k)) {
          await dmOwner(m, offlineBoost ? 'Urgent content spotted (you’re away)' : 'Potentially dangerous content spotted',
            `In **#${(m.channel as any)?.name ?? m.channelId}**:\n> ${content.slice(0, 500)}`);
        }
      }
    } catch {}
  });
}

/* control surface for the command wrapper */
export const GuardianControl = {
  async sendTest(ctx: any) {
    await (dmOwner as any)(ctx, "Guardian test", "This is how I’ll DM you when something needs your attention.", "info");
  },
  toggleGuild(gid: string, on: boolean) {
    if (on) (disabledGuilds as any).delete(gid);
    else (disabledGuilds as any).add(gid);
  },
  listIgnores(gid: string): string[] {
    const set = ignoreByGuild.get(gid) ?? new Set<string>();
    return [...set];
  },
  addIgnore(gid: string, id: string, name?: string) {
    const set = ignoreByGuild.get(gid) ?? new Set<string>();
    set.add(id); if (name) set.add(name); ignoreByGuild.set(gid, set);
  },
  removeIgnore(gid: string, id: string, name?: string) {
    const set = ignoreByGuild.get(gid) ?? new Set<string>();
    set.delete(id); if (name) set.delete(name); ignoreByGuild.set(gid, set);
  },
};
