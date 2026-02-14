import {
  ChatInputCommandInteraction, Client, Colors, EmbedBuilder,
  GuildMember, PermissionFlagsBits as P, REST, Routes, SlashCommandBuilder,
  SlashCommandIntegerOption, SlashCommandStringOption
} from 'discord.js';
import type { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type { EcoItem } from "../types/prisma-shapes";
import { getPrisma } from "../utils/prisma";
import { safeRespond } from "../utils/safeReply";
import { MessageFlags } from "discord.js";
import { getEventMultipliers } from "../commands/event";

const prisma = getPrisma();

/* ---------- CONFIG ---------- */
const CURRENCY = process.env.ECO_CURRENCY_NAME ?? 'Shards';
const DAILY_BASE = BigInt(process.env.ECO_DAILY_BASE ?? '250');
const WEEKLY_BASE = BigInt(process.env.ECO_WEEKLY_BASE ?? '1750');
const TRANSFER_TAX_BP = Number(process.env.ECO_TRANSFER_TAX_BP ?? '50');
const MSG_COOLDOWN_MS = Number(process.env.XP_MSG_COOLDOWN_MS ?? '60000');
const MSG_BASE_XP = Number(process.env.XP_MSG_BASE ?? '10');
const MSG_LEN_UNIT = Number(process.env.XP_MSG_LEN_UNIT ?? '80');
const MSG_LEN_CAP = Number(process.env.XP_MSG_LEN_CAP ?? '20');
const VOICE_TICK_MS = Number(process.env.XP_VOICE_TICK_MS ?? '60000');
const VOICE_XP_PER_MIN = Number(process.env.XP_VOICE_PER_MIN ?? '6');

// Anti-spam / quality gates
const XP_MSG_WINDOW_MS         = Number(process.env.XP_MSG_WINDOW_MS ?? '300000'); // 5m
const XP_MSG_MAX_AWARDS        = Number(process.env.XP_MSG_MAX_AWARDS ?? '5');    // per window
const XP_MSG_SIMILAR_WINDOW_MS = Number(process.env.XP_MSG_SIMILAR_WINDOW_MS ?? '600000'); // 10m
const XP_MSG_MIN_ALNUM_RATIO   = Number(process.env.XP_MSG_MIN_ALNUM_RATIO ?? '0.5');      // 50%

// Voice anti-farm
const VOICE_REQUIRE_HUMANS     = Number(process.env.XP_VOICE_REQUIRE_HUMANS ?? '2');
const VOICE_MAX_SESSION_MIN    = Number(process.env.XP_VOICE_MAX_SESSION_MIN ?? '240');

const BOT_OWNER_ID = process.env.BOT_OWNER_ID ?? process.env.FORSA_ID;

const DISABLED_CHANNELS = new Set(
  (process.env.XP_DISABLED_CHANNELS ?? '').split(',').map(s => s.trim()).filter(Boolean)
);
const MIN_MESSAGE_LEN = Number(process.env.XP_MIN_MESSAGE_LEN ?? '6');

/* ---------- INTERNAL ---------- */
const lastMsgAt   = new Map<string, number>();   // userId:guildId -> ts
// const voiceJoinAt = new Map<string, number>();   // userId:guildId -> ts
const msgWindow   = new Map<string, number[]>(); // rolling timestamps
const msgSigs     = new Map<string, Array<{sig: string, ts: number}>>();
const PROGRESSION_WIRED = Symbol.for('vi.progression.wired');

/* ---------- helpers ---------- */
function levelReq(level: number) { return 5 * level * level + 50 * level; }
// function nextLevelAt(level: number) { return levelReq(level); }
function messageLenBonus(len: number) { return Math.min(MSG_LEN_CAP, Math.floor(len / MSG_LEN_UNIT)); }
function levelFromTotalXp(total: number) {
  let level = 0;
  let need = levelReq(level);
  let into = total;

  while (into >= need) {
    into -= need;      // spend XP for this level
    level++;
    need = levelReq(level);
  }
  return { level, into, need }; // progress = into / need
}

// content cleaning + quality checks
const URL_RE = /https?:\/\/\S+/gi;
const MENTION_OR_EMOJI_RE = /<a?:\w+:\d+>|<@!?&?\d+>/g;

function cleanContent(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/`{3}[\s\S]*?`{3}/g, '')   // code blocks
    .replace(/`[^`]*`/g, '')           // inline code
    .replace(URL_RE, '')
    .replace(MENTION_OR_EMOJI_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function alnumRatio(s: string) {
  const a = s.replace(/[^a-z0-9]/gi, '');
  return (a.length) / (s.length || 1);
}
function maxRunLen(s: string) {
  let max = 1, cur = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === s[i - 1]) cur++;
    else { if (cur > max) max = cur; cur = 1; }
  }
  return Math.max(max, cur);
}
function isLowQuality(s: string) {
  if (s.length < MIN_MESSAGE_LEN) return true;
  if (alnumRatio(s) < XP_MSG_MIN_ALNUM_RATIO) return true;
  if (maxRunLen(s) > Math.floor(s.length * 0.5)) return true; // e.g., “loooool”
  return false;
}
function signature(s: string) {
  return createHash('sha1').update(s).digest('hex').slice(0, 16);
}

async function ensureProfiles(userId: string, guildId: string) {
  await prisma.$transaction([
    prisma.xpProfile.upsert({
      where: { userId_guildId: { userId, guildId } },
      update: {},
      create: { userId, guildId },
    }),
    prisma.ecoAccount.upsert({
      where: { userId_guildId: { userId, guildId } },
      update: {},
      create: { userId, guildId },
    }),
  ]);
}

// ❗ return leveledUp so we only ping once per real level-up
async function grantXp(userId: string, guildId: string, delta: number, source: string, meta?: object) {
  const now = new Date();
  
  // Apply event multiplier
  const event = getEventMultipliers();
  const finalDelta = Math.floor(delta * event.xpMultiplier);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const before = await tx.xpProfile.findUnique({
      where: { userId_guildId: { userId, guildId } },
      select: { xp: true, level: true },
    });

    // update-or-create XP
    let afterXp: number;
    if (before) {
      const updated = await tx.xpProfile.update({
        where: { userId_guildId: { userId, guildId } },
        data: { xp: { increment: finalDelta }, ...(source === 'message' ? { lastMsgAt: now } : {}) },
        select: { xp: true },
      });
      afterXp = updated.xp;
    } else {
      const created = await tx.xpProfile.create({
        data: { userId, guildId, xp: finalDelta, level: 0, ...(source === 'message' ? { lastMsgAt: now } : {}) },
        select: { xp: true },
      });
      afterXp = created.xp;
    }

    // derive true level from TOTAL XP
    const prevLevel = before?.level ?? 0;
    const { level: newLevel } = levelFromTotalXp(afterXp);

    if (newLevel !== prevLevel) {
      await tx.xpProfile.update({
        where: { userId_guildId: { userId, guildId } },
        data: { level: newLevel },
      });
    }

    await tx.xpEvent.create({ data: { userId, guildId, source, delta: finalDelta, meta } });

    const rewards = await tx.levelRole.findMany({ where: { guildId, level: { lte: newLevel } } });
    return { updated: { level: newLevel, xp: afterXp } as any, rewards, leveledUp: newLevel > prevLevel };
  });
}


async function awardLevelRoles(gm: GuildMember, uptoLevel: number) {
  const roles = await prisma.levelRole.findMany({
    where: { guildId: gm.guild.id, level: { lte: uptoLevel } },
  });
  for (const rr of roles) {
    if (!gm.roles.cache.has(rr.roleId)) {
      try { await gm.roles.add(rr.roleId, 'Level reward'); } catch {}
    }
  }
}

async function ecoTransact(userId: string, guildId: string, amount: bigint, type: string, meta?: object) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const acc = await tx.ecoAccount.upsert({
      where: { userId_guildId: { userId, guildId } },
      update: {},
      create: { userId, guildId },
    });
    const newBal = BigInt(acc.balance) + amount;
    if (newBal < 0n) throw new Error('Insufficient funds');
    await tx.ecoAccount.update({
      where: { userId_guildId: { userId, guildId } },
      data: { balance: newBal },
    });
    await tx.ecoTx.create({ data: { userId, guildId, type, amount, meta } });
    return newBal;
  });
}

function ensureStaff(i: ChatInputCommandInteraction) {
  return i.memberPermissions?.has(P.ManageGuild) || i.user.id === BOT_OWNER_ID;
}
function fmtBal(n: bigint) { return `${n.toString()} ${CURRENCY}`; }
async function cooldownCheck(last: Date | null | undefined, ms: number) {
  if (!last) return { ok: true, remainingMs: 0 };
  const nextAt = last.getTime() + ms;
  const now = Date.now();
  if (now >= nextAt) return { ok: true, remainingMs: 0 };
  return { ok: false, remainingMs: nextAt - now };
}
function humanMs(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h ? `${h}h` : '', m ? `${m}m` : '', ss ? `${ss}s` : ''].filter(Boolean).join(' ');
}

/* ---------- MESSAGE XP ---------- */
export function wireMessageXp(client: Client) {
  client.on('messageCreate', async (m) => {
    try {
      if (!m.inGuild() || m.author.bot) return;
      if (DISABLED_CHANNELS.has(m.channelId)) return;

      const cleaned = cleanContent(m.content || '');
      if (isLowQuality(cleaned)) return;

      const key = `${m.author.id}:${m.guildId}`;
      const now = Date.now();

      // per-user cooldown
      const last = lastMsgAt.get(key) ?? 0;
      if (now - last < MSG_COOLDOWN_MS) return;

      // rolling window cap
      const win = msgWindow.get(key) ?? [];
      const cut = now - XP_MSG_WINDOW_MS;
      while (win.length && win[0] < cut) win.shift();
      if (win.length >= XP_MSG_MAX_AWARDS) return;

      // duplicate in window
      const sig = signature(cleaned);
      const sigs = msgSigs.get(key) ?? [];
      if (sigs.some(v => v.sig === sig && (now - v.ts) < XP_MSG_SIMILAR_WINDOW_MS)) return;
      sigs.push({ sig, ts: now });
      if (sigs.length > 20) sigs.shift();
      msgSigs.set(key, sigs);

      // award
      lastMsgAt.set(key, now);
      win.push(now);
      msgWindow.set(key, win);

      const delta = MSG_BASE_XP + messageLenBonus(cleaned.length);
      const { updated, leveledUp } =
        await grantXp(m.author.id, m.guildId, delta, 'message', { channel: m.channelId });

      if (leveledUp) {
        try {
          const gm = await m.guild.members.fetch(m.author.id);
          await awardLevelRoles(gm, updated.level);
          await m.channel.send({
            embeds: [new EmbedBuilder()
              .setColor(Colors.Blurple)
              .setDescription(`🎉 ${m.author} reached **Level ${updated.level}**! Keep going.`)],
          });
        } catch {}
      }
    } catch (e) {
      console.error('[xp:message]', e);
    }
  });
}

/* ---------- VOICE XP ---------- */
// === voice ticker version ===
const voiceSessions = new Map<string, {
  guildId: string;
  userId: string;
  channelId: string;
  grantedMin: number;   // minutes granted this session (to enforce cap)
  startedAt: number;
}>();

function sessionKey(userId: string, guildId: string) { return `${userId}:${guildId}`; }

export function wireVoiceXp(client: Client) {
  // track joins / leaves / moves
  client.on('voiceStateUpdate', async (oldS, newS) => {
    try {
      const guildId = (newS.guild || oldS.guild).id;
      const userId = newS.id;
      if (newS.member?.user.bot) return;

      const key = sessionKey(userId, guildId);

      // join
      if (!oldS.channelId && newS.channelId) {
        voiceSessions.set(key, {
          guildId, userId,
          channelId: newS.channelId,
          grantedMin: 0,
          startedAt: Date.now(),
        });
        return;
      }

      // move channels
      if (oldS.channelId && newS.channelId && oldS.channelId !== newS.channelId) {
        const s = voiceSessions.get(key);
        if (s) s.channelId = newS.channelId;
        return;
      }

      // leave
      if (oldS.channelId && !newS.channelId) {
        voiceSessions.delete(key);
        return;
      }
    } catch (e) {
      console.error('[xp:voice]', e);
    }
  });

  // global minute ticker
  const tickMs = VOICE_TICK_MS; // usually 60_000
  setInterval(async () => {
    for (const [key, s] of voiceSessions) {
      try {
        if (s.grantedMin >= VOICE_MAX_SESSION_MIN) continue; // cap per session

        const guild = client.guilds.cache.get(s.guildId) || await client.guilds.fetch(s.guildId).catch(() => null);
        if (!guild) { voiceSessions.delete(key); continue; }

        const member = guild.members.cache.get(s.userId) || await guild.members.fetch(s.userId).catch(() => null);
        const channel = member?.voice?.channel;
        if (!member || !channel || channel.id !== s.channelId) { voiceSessions.delete(key); continue; }

        // require humans present (no solo-afk); don't count bots or deafened
        const humans = channel.members.filter(mm =>
          !mm.user.bot && !mm.voice.selfDeaf && !mm.voice.serverDeaf
        ).size;

        if (humans >= VOICE_REQUIRE_HUMANS) {
          // award this minute
          s.grantedMin += 1;

          const { leveledUp, updated } =
            await grantXp(s.userId, s.guildId, VOICE_XP_PER_MIN, 'voice', {
              channel: channel.id, tick: s.grantedMin
            });

          // track time spent
          await prisma.xpProfile.update({
            where: { userId_guildId: { userId: s.userId, guildId: s.guildId } },
            data: { voiceMs: { increment: tickMs } },
          }).catch(() => {});

          if (leveledUp) {
            try {
              const gm = await guild.members.fetch(s.userId);
              await awardLevelRoles(gm, updated.level);
            } catch {}
          }
        }
      } catch (e) {
        console.error('[xp:voice:tick]', e);
      }
    }
  }, tickMs);
}

/* ---------- SLASH COMMANDS ---------- */
const cmds = [
  new SlashCommandBuilder().setName('rank')
    .setDescription('Show your or another user’s level/xp.')
    .addUserOption(o => o.setName('user').setDescription('Target user')),
  new SlashCommandBuilder().setName('leaderboard')
    .setDescription('Show server leaderboard')
    .addStringOption((o: SlashCommandStringOption) =>
      o.setName('type').setDescription('xp|level|balance').addChoices(
        { name: 'xp', value: 'xp' }, { name: 'level', value: 'level' }, { name: 'balance', value: 'balance' }
      ))
    .addIntegerOption((o: SlashCommandIntegerOption) =>
      o.setName('page').setDescription('Page number (1-based)').setMinValue(1)),
  new SlashCommandBuilder().setName('daily').setDescription(`Claim your daily ${CURRENCY}`),
  new SlashCommandBuilder().setName('weekly').setDescription(`Claim your weekly ${CURRENCY}`),
  new SlashCommandBuilder().setName('balance').setDescription('Check your or another user’s balance')
    .addUserOption(o => o.setName('user').setDescription('Target user')),
  new SlashCommandBuilder().setName('transfer').setDescription(`Transfer ${CURRENCY} to a user`)
    .addUserOption(o => o.setName('to').setDescription('Recipient').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('shop').setDescription('Browse the Lore Market')
    .addStringOption(o => o.setName('category').setDescription('Filter by category').addChoices(
      { name: 'All Categories', value: 'all' },
      { name: 'Hybrid Evolutions', value: 'Hybrid Evolutions' },
      { name: 'Titles & Auras', value: 'Titles & Auras' },
      { name: 'Utility Items', value: 'Utility Items' },
      { name: 'Seasonal & Limited', value: 'Seasonal & Limited' }
    ))
    .addIntegerOption(o => o.setName('page').setDescription('Page').setMinValue(1)),
  new SlashCommandBuilder().setName('buy').setDescription('Purchase an item from the Lore Market')
    .addStringOption(o => o.setName('sku').setDescription('Item SKU').setRequired(true))
    .addIntegerOption(o => o.setName('qty').setDescription('Quantity').setMinValue(1)),
  new SlashCommandBuilder().setName('inventory').setDescription('View your purchased items and unlocks'),
  // Admin
  new SlashCommandBuilder().setName('give')
    .setDescription(`ADMIN: give ${CURRENCY} or XP`)
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption(o => o.setName('kind').setDescription('eco|xp').setRequired(true).addChoices(
      { name: 'eco', value: 'eco' }, { name: 'xp', value: 'xp' }
    ))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('setlevel')
    .setDescription('ADMIN: set user level directly')
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
    .addIntegerOption(o => o.setName('level').setDescription('Level').setRequired(true).setMinValue(0)),
  new SlashCommandBuilder().setName('setbalance')
    .setDescription(`ADMIN: set user ${CURRENCY} balance`)
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
    .addIntegerOption(o => o.setName('balance').setDescription('New balance').setRequired(true).setMinValue(0)),
  new SlashCommandBuilder().setName('levelrole')
    .setDescription('ADMIN: map a level to a role')
    .addIntegerOption(o => o.setName('level').setDescription('Level').setRequired(true).setMinValue(0))
    .addRoleOption(o => o.setName('role').setDescription('Role to grant at this level').setRequired(true)),
].map(c => c.setDMPermission(false));

// Export command data and handler mapping for central registration
export { cmds };

// Map command names to their handlers
const handlerMap: Record<string, (i: ChatInputCommandInteraction) => Promise<any>> = {
  'rank': handleRank,
  'leaderboard': handleLeaderboard,
  'daily': handleDaily,
  'weekly': handleWeekly,
  'balance': handleBalance,
  'transfer': handleTransfer,
  'shop': handleShop,
  'buy': handleBuy,
  'inventory': handleInventory,
  'give': handleGive,
  'setlevel': handleSetLevel,
  'setbalance': handleSetBalance,
  'levelrole': handleLevelRole,
};

// Export as CommandModule array for central registry
export const progressionCommands = cmds.map(cmd => ({
  data: cmd,
  execute: handlerMap[cmd.name],
}));

export async function registerProgressionCommands(client: Client, guildId: string) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);
  const defs = cmds.map(c => c.toJSON());
  
  // Fetch existing commands to avoid overwriting core commands
  const existing = (await rest.get(Routes.applicationGuildCommands(client.user!.id, guildId))) as any[];
  
  // Separate progression from core commands
  const progNames = new Set(defs.map((d: any) => d.name));
  const coreCommands = existing.filter((c: any) => !progNames.has(c.name));
  
  // Merge: keep core commands, update/add progression commands
  const allCommands = [...coreCommands, ...defs];
  
  // Bulk PUT with all commands (core + progression)
  await rest.put(
    Routes.applicationGuildCommands(client.user!.id, guildId),
    { body: allCommands }
  );
  
  console.log(`✓ Progression commands registered (${defs.length} commands via bulk PUT, ${coreCommands.length} core preserved)`);
}

/* ---------- handlers ---------- */
async function handleRank(i: ChatInputCommandInteraction) {
  const user = i.options.getUser('user') ?? i.user;
  await ensureProfiles(user.id, i.guildId!);

  const prof = await prisma.xpProfile.findUnique({
    where: { userId_guildId: { userId: user.id, guildId: i.guildId! } },
  });
  const acc = await prisma.ecoAccount.findUnique({
    where: { userId_guildId: { userId: user.id, guildId: i.guildId! } },
  });

  const { level, into, need } = levelFromTotalXp(Number(prof?.xp ?? 0));
  const pct = Math.floor((into / Math.max(need, 1)) * 100);

  const e = new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setAuthor({ name: `${user.username}`, iconURL: user.displayAvatarURL() })
    .setTitle('Rank')
    .addFields(
      { name: 'Level', value: String(level), inline: true },
      { name: 'Progress', value: `${into} / ${need} (${pct}%)`, inline: true },
      { name: 'Balance', value: fmtBal(BigInt(acc?.balance ?? 0)), inline: true },
    );

  await safeRespond(i, { embeds: [e] });
}

async function handleLeaderboard(i: ChatInputCommandInteraction) {
  const type = (i.options.getString('type') ?? 'xp') as 'xp'|'level'|'balance';
  const page = i.options.getInteger('page') ?? 1;
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  if (type === 'balance') {
    const rows = await prisma.ecoAccount.findMany({
      where: { guildId: i.guildId! },
      orderBy: { balance: 'desc' },
      take: pageSize, skip: offset,
    });
  const lines = rows.map((r: any, idx: number) => `**${offset + idx + 1}.** <@${r.userId}> — ${fmtBal(BigInt(r.balance))}`);
    return safeRespond(i, { embeds: [new EmbedBuilder().setTitle(`Leaderboard — ${CURRENCY}`)
      .setDescription(lines.join('\n') || 'No data').setColor(Colors.Gold)] });
  } else {
    const rows = await prisma.xpProfile.findMany({
      where: { guildId: i.guildId! },
      orderBy: type === 'xp' ? { xp: 'desc' } : { level: 'desc' },
      take: pageSize, skip: offset,
    });
  const lines = rows.map((r: any, idx: number) => `**${offset + idx + 1}.** <@${r.userId}> — Lv ${r.level} • ${r.xp} XP`);
    return safeRespond(i, { embeds: [new EmbedBuilder().setTitle(`Leaderboard — ${type.toUpperCase()}`)
      .setDescription(lines.join('\n') || 'No data').setColor(Colors.Aqua)] });
  }
}

async function handleDaily(i: ChatInputCommandInteraction) {
  await ensureProfiles(i.user.id, i.guildId!);
  const prof = await prisma.xpProfile.findUnique({ where: { userId_guildId: { userId: i.user.id, guildId: i.guildId! } } });
  const cd = await cooldownCheck(prof?.lastDaily ?? null, 1000 * 60 * 60 * 20);
  if (!cd.ok) return safeRespond(i, { content: `⏳ Come back in ${humanMs(cd.remainingMs)}.`, flags: MessageFlags.Ephemeral });

  const mult = 1 + ((prof?.level ?? 0) * 0.02);
  const baseReward = BigInt(Math.floor(Number(DAILY_BASE) * mult));
  
  // Apply event multiplier to base, then add bonus
  const event = getEventMultipliers();
  let reward = BigInt(Math.floor(Number(baseReward) * event.shardMultiplier));
  if (event.active && event.dailyBonus > 0) {
    reward += BigInt(event.dailyBonus);
  }
  
  // Award XP (50 base with event multiplier)
  const dailyXp = 50;
  const { updated } = await grantXp(i.user.id, i.guildId!, dailyXp, 'daily', { level: prof?.level ?? 0 });
  
  await prisma.xpProfile.update({ where: { userId_guildId: { userId: i.user.id, guildId: i.guildId! } }, data: { lastDaily: new Date() } });
  const bal = await ecoTransact(i.user.id, i.guildId!, reward, 'daily', { level: prof?.level ?? 0 });
  
  const xpMsg = ` +${Math.floor(dailyXp * event.xpMultiplier)} XP`;
  const eventMsg = event.active ? ` (${event.shardMultiplier}x event` + (event.dailyBonus > 0 ? ` +${event.dailyBonus} bonus` : '') + ')' : '';
  await safeRespond(i, { content: `✅ Claimed **${reward} ${CURRENCY}**${xpMsg} (level mult x${mult.toFixed(2)})${eventMsg}. New balance: **${fmtBal(bal)}**` }, { preferDefer: true });
}

async function handleWeekly(i: ChatInputCommandInteraction) {
  await ensureProfiles(i.user.id, i.guildId!);
  const prof = await prisma.xpProfile.findUnique({ where: { userId_guildId: { userId: i.user.id, guildId: i.guildId! } } });
  const cd = await cooldownCheck(prof?.lastWeekly ?? null, 1000 * 60 * 60 * 24 * 6.5);
  if (!cd.ok) return safeRespond(i, { content: `⏳ Come back in ${humanMs(cd.remainingMs)}.`, flags: MessageFlags.Ephemeral });

  const mult = 1 + ((prof?.level ?? 0) * 0.02);
  const baseReward = BigInt(Math.floor(Number(WEEKLY_BASE) * mult));
  
  // Apply event multiplier to base, then add bonus
  const event = getEventMultipliers();
  let reward = BigInt(Math.floor(Number(baseReward) * event.shardMultiplier));
  if (event.active && event.weeklyBonus > 0) {
    reward += BigInt(event.weeklyBonus);
  }
  
  // Award XP (200 base with event multiplier)
  const weeklyXp = 200;
  const { updated } = await grantXp(i.user.id, i.guildId!, weeklyXp, 'weekly', { level: prof?.level ?? 0 });
  
  await prisma.xpProfile.update({ where: { userId_guildId: { userId: i.user.id, guildId: i.guildId! } }, data: { lastWeekly: new Date() } });
  const bal = await ecoTransact(i.user.id, i.guildId!, reward, 'weekly', { level: prof?.level ?? 0 });
  
  const xpMsg = ` +${Math.floor(weeklyXp * event.xpMultiplier)} XP`;
  const eventMsg = event.active ? ` (${event.shardMultiplier}x event` + (event.weeklyBonus > 0 ? ` +${event.weeklyBonus} bonus` : '') + ')' : '';
  await safeRespond(i, { content: `✅ Claimed **${reward} ${CURRENCY}**${xpMsg} (level mult x${mult.toFixed(2)})${eventMsg}. New balance: **${fmtBal(bal)}**` }, { preferDefer: true });
}

async function handleBalance(i: ChatInputCommandInteraction) {
  const user = i.options.getUser('user') ?? i.user;
  await ensureProfiles(user.id, i.guildId!);
  const acc = await prisma.ecoAccount.findUnique({ where: { userId_guildId: { userId: user.id, guildId: i.guildId! } } });
  await safeRespond(i, { content: `${user}: **${fmtBal(BigInt(acc?.balance ?? 0))}**` });
}

async function handleTransfer(i: ChatInputCommandInteraction) {
  const to = i.options.getUser('to', true);
  const amount = BigInt(i.options.getInteger('amount', true));
  if (to.bot || to.id === i.user.id) return safeRespond(i, { content: 'Invalid recipient.', flags: MessageFlags.Ephemeral });
  await ensureProfiles(i.user.id, i.guildId!);
  await ensureProfiles(to.id, i.guildId!);

  const tax = (amount * BigInt(TRANSFER_TAX_BP)) / 10000n;
  const net = amount - tax;
  try {
    await ecoTransact(i.user.id, i.guildId!, -amount, 'gift', { to: to.id, tax });
    await ecoTransact(to.id, i.guildId!, net, 'gift', { from: i.user.id, tax });
    await safeRespond(i, { content: `💸 Sent **${fmtBal(net)}** to ${to} (tax **${fmtBal(tax)}**).` }, { preferDefer: true });
  } catch {
    await safeRespond(i, { content: 'Insufficient funds.', flags: MessageFlags.Ephemeral });
  }
}

async function handleShop(i: ChatInputCommandInteraction) {
  const category = i.options.getString('category') ?? 'all';
  const page = i.options.getInteger('page') ?? 1;
  const pageSize = 10;

  // Build query based on category filter
  const categories = [
    'Hybrid Evolutions',
    'Titles & Auras',
    'Utility Items',
    'Seasonal & Limited',
  ];

  if (category !== 'all') {
    // Fetch by data.category or fallback to kind grouping
    const items = await prisma.ecoItem.findMany({
      where: { guildId: i.guildId! },
    });
    const filtered = items.filter((it: any) => {
      const cat = (it.data)?.category ?? mapKindToCategory(it.kind);
      return cat === category;
    });
    return displayShopPage(i, filtered, category, page, pageSize);
  }

  // Show all items grouped by category
  const allItems = await prisma.ecoItem.findMany({
    where: { guildId: i.guildId! },
    orderBy: { price: 'asc' },
  });

  if (!allItems.length) {
    const e = new EmbedBuilder()
      .setTitle('🏛️ Lore Market')
      .setDescription('No items available. The market is empty!')
      .setColor(Colors.Gold);
    return safeRespond(i, { embeds: [e] });
  }

  // Group by category
  const grouped = new Map<string, any[]>();
  for (const cat of categories) grouped.set(cat, []);

  for (const it of allItems) {
    const cat = mapKindToCategory(it.kind);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(it);
  }

  const e = new EmbedBuilder()
    .setTitle('🏛️ Lore Market')
    .setDescription([
      `Welcome to the **Lore Market** — your gateway to power, prestige, and progression.`,
      ``,
      `💠 **Currency:** ${CURRENCY}`,
      `Use \`/shop category:<name>\` to filter by category.`,
      `Use \`/buy sku:<item>\` to purchase.`,
    ].join('\n'))
    .setColor(Colors.Gold);

  for (const [cat, items] of grouped.entries()) {
    if (!items.length) continue;
    const preview = items.slice(0, 3).map((it: any) => 
      `• ${it.name} — ${fmtBal(BigInt(it.price))}`
    ).join('\n');
    const more = items.length > 3 ? `\n_+${items.length - 3} more..._` : '';
    e.addFields({
      name: cat,
      value: preview + more,
      inline: false,
    });
  }

  e.setFooter({ text: `Page ${page} • Use /shop category:<name> for full listings` });
  await safeRespond(i, { embeds: [e] });
}

function mapKindToCategory(kind: string): string {
  const map: Record<string, string> = {
    'hybrid-unlock': 'Hybrid Evolutions',
    'title': 'Titles & Auras',
    'aura': 'Titles & Auras',
    'cosmetic': 'Titles & Auras',
    'booster': 'Utility Items',
    'utility': 'Utility Items',
    'lore-token': 'Utility Items',
  };
  return map[kind] ?? 'Seasonal & Limited';
}

async function displayShopPage(i: ChatInputCommandInteraction, items: any[], category: string, page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = items.slice(start, end);

  const e = new EmbedBuilder()
    .setTitle(`🏛️ ${category}`)
    .setColor(Colors.Gold);

  if (!pageItems.length) {
    e.setDescription('No items in this category.');
  } else {
    const lines = pageItems.map((it: any) => {
      const stockTag = it.stock != null ? ` • **${it.stock} left**` : '';
      const desc = (it.data)?.description ?? it.kind;
      return `**${it.name}**\n${desc}\n💠 ${fmtBal(BigInt(it.price))} • \`${it.sku}\`${stockTag}`;
    });
    e.setDescription(lines.join('\n\n'));
  }

  const totalPages = Math.ceil(items.length / pageSize);
  e.setFooter({ text: `Page ${page}/${totalPages} • ${items.length} items` });
  await safeRespond(i, { embeds: [e] });
}

async function handleBuy(i: ChatInputCommandInteraction) {
  const sku = i.options.getString('sku', true).toLowerCase();
  const qty = BigInt(i.options.getInteger('qty') ?? 1);
  const item = await prisma.ecoItem.findUnique({ where: { guildId_sku: { guildId: i.guildId!, sku } } });
  if (!item) return safeRespond(i, { content: 'Item not found.', flags: MessageFlags.Ephemeral });

  const cost = BigInt(item.price) * qty;
  try {
    const newBal = await ecoTransact(i.user.id, i.guildId!, -cost, 'buy', { sku, qty: Number(qty) });
    if (item.stock != null) {
      if (item.stock < Number(qty)) throw new Error('Out of stock');
      await prisma.ecoItem.update({ where: { id: item.id }, data: { stock: item.stock - Number(qty) } });
    }
    await prisma.ecoInventory.create({ data: { userId: i.user.id, guildId: i.guildId!, sku, qty: Number(qty) } });

    if (item.kind === 'role') {
      const roleId = (item.data)?.roleId as string | undefined;
      if (roleId) {
        try {
          const gm = await i.guild!.members.fetch(i.user.id);
          await gm.roles.add(roleId, `Purchased ${sku}`);
        } catch {}
      }
    }
    await safeRespond(i, { content: `🛒 Purchased **${item.name} x${qty}** for **${fmtBal(cost)}**. New balance: **${fmtBal(newBal)}**` }, { preferDefer: true });
  } catch (e: any) {
    await safeRespond(i, { content: `Purchase failed: ${e?.message ?? 'error'}`, flags: MessageFlags.Ephemeral });
  }
}

async function handleInventory(i: ChatInputCommandInteraction) {
  const inv = await prisma.ecoInventory.findMany({ where: { userId: i.user.id, guildId: i.guildId! }, orderBy: { createdAt: 'desc' } });
  if (!inv.length) return safeRespond(i, { content: 'Inventory empty.' });
  const items = await prisma.ecoItem.findMany({ where: { guildId: i.guildId!, sku: { in: inv.map((v: any) => v.sku) } } });
  const map = new Map<string, EcoItem>(items.map((it: any) => [it.sku, it]));
  const lines = inv.map((v: any) => `• **${(map.get(v.sku)?.name ?? v.sku)}** x${v.qty}`);
  await safeRespond(i, { content: lines.join('\n') });
}

async function handleGive(i: ChatInputCommandInteraction) {
  if (!ensureStaff(i)) return safeRespond(i, { content: 'Nope.', flags: MessageFlags.Ephemeral });
  const user = i.options.getUser('user', true);
  const kind = i.options.getString('kind', true) as 'eco'|'xp';
  const amount = i.options.getInteger('amount', true);
  await ensureProfiles(user.id, i.guildId!);

  if (kind === 'eco') {
    const bal = await ecoTransact(user.id, i.guildId!, BigInt(amount), 'admin', { by: i.user.id });
    await safeRespond(i, { content: `Admin grant: ${user} **+${fmtBal(BigInt(amount))}** → ${fmtBal(bal)}` });
  } else {
    await grantXp(user.id, i.guildId!, amount, 'admin', { by: i.user.id });
    await safeRespond(i, { content: `Admin XP grant: ${user} **+${amount} XP**` });
  }
}

async function handleSetLevel(i: ChatInputCommandInteraction) {
  if (!ensureStaff(i)) return safeRespond(i, { content: 'Nope.', flags: MessageFlags.Ephemeral });
  const user = i.options.getUser('user', true);
  const level = i.options.getInteger('level', true);
  await prisma.xpProfile.upsert({
    where: { userId_guildId: { userId: user.id, guildId: i.guildId! } },
    update: { level },
    create: { userId: user.id, guildId: i.guildId!, level },
  });
  try {
    const gm = await i.guild!.members.fetch(user.id);
    await awardLevelRoles(gm, level);
  } catch {}
  await safeRespond(i, { content: `Set ${user} to level **${level}**.` });
}

async function handleSetBalance(i: ChatInputCommandInteraction) {
  if (!ensureStaff(i)) return safeRespond(i, { content: 'Nope.', flags: MessageFlags.Ephemeral });
  const user = i.options.getUser('user', true);
  const balance = BigInt(i.options.getInteger('balance', true));
  await prisma.ecoAccount.upsert({
    where: { userId_guildId: { userId: user.id, guildId: i.guildId! } },
    update: { balance },
    create: { userId: user.id, guildId: i.guildId!, balance },
  });
  await safeRespond(i, { content: `Set ${user} balance to **${fmtBal(balance)}**.` });
}

  async function handleLevelRole(i: ChatInputCommandInteraction) {
    if (!ensureStaff(i)) return safeRespond(i, { content: 'Nope.', flags: MessageFlags.Ephemeral });
    const level = i.options.getInteger('level', true);
    const role = i.options.getRole('role', true);
    await prisma.levelRole.upsert({
      where: { guildId_level: { guildId: i.guildId!, level } },
      update: { roleId: role.id },
      create: { guildId: i.guildId!, level, roleId: role.id },
    });
    await safeRespond(i, { content: `Level **${level}** now awards ${role}.` });
  }

/* ---------- PUBLIC INIT ---------- */

// (Slash handling moved to the central router.)

export function initProgression(client: Client) {
  if ((client as any)[PROGRESSION_WIRED]) return;
  (client as any)[PROGRESSION_WIRED] = true;

  wireMessageXp(client);
  wireVoiceXp(client);
}

export const progressionHandlers = {
  rank: handleRank,
  leaderboard: handleLeaderboard,
  daily: handleDaily,
  weekly: handleWeekly,
  balance: handleBalance,
  transfer: handleTransfer,
  shop: handleShop,
  buy: handleBuy,
  inventory: handleInventory,
  give: handleGive,
  setlevel: handleSetLevel,
  setbalance: handleSetBalance,
    levelrole: handleLevelRole,
};
