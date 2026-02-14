// src/modules/polls/runtime.ts
// Responsible for managing live poll state, vote tracking, results, and archive helpers.

import {
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  EmbedBuilder, Colors, TextChannel, GuildMember,
  PermissionFlagsBits as P, Message, ComponentType,
  ChatInputCommandInteraction
} from "discord.js";
import {
  ArchiveRecord, BuiltPoll, VoteSnapshot,
  archiveWrite, archiveRead, archiveListRecent
} from "./storage";
import { getWeightForMember } from "./weights";
import { MessageFlags } from "discord.js";

/** -------------------- In-memory Poll State -------------------- */
type LiveState = {
  config: BuiltPoll;
  message: Message;
  creatorId: string;
  guildId: string;
  channelId: string;
  endAt: number;
  voters: Map<string, Set<number>>;
  weights: Map<string, number>;
  collectorEnded?: boolean;
};
const manager = new Map<string, LiveState>(); // messageId -> state

export function registerLive(message: Message, config: BuiltPoll, creatorId: string, durationMs: number) {
  manager.set(message.id, {
    config, message, creatorId,
    guildId: message.guild!.id,
    channelId: message.channel.id,
    endAt: Date.now() + durationMs,
    voters: new Map(),
    weights: new Map(),
  });
}
export function getLive(messageId: string) { return manager.get(messageId); }
export function setCollectorEnded(messageId: string) {
  const s = manager.get(messageId);
  if (s) s.collectorEnded = true;
}

/** -------------------- Weighted Tally & Display -------------------- */
export function countWeighted(config: BuiltPoll, s?: LiveState) {
  const counts = new Array(config.answers.length).fill(0);
  if (!s) return counts;
  for (const [uid, choices] of s.voters) {
    const w = s.weights.get(uid) ?? 1;
    for (const idx of choices) if (idx >= 0 && idx < counts.length) counts[idx] += w;
  }
  return counts;
}

function bar(pct: number) {
  const filled = Math.round((pct / 100) * 10);
  return "▰".repeat(Math.max(0, Math.min(10, filled))) + "▱".repeat(Math.max(0, 10 - filled));
}
function renderResultsFromCounts(config: BuiltPoll, counts: number[]) {
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const lines = config.answers.map((a, i) => {
    const pct = Math.round((counts[i] / total) * 100);
    const tag = a.emoji ? `${a.emoji} ${a.label}` : a.label;
    return `**${tag}** — ${pct}% (${counts[i].toFixed(2)})\n${bar(pct)}`;
  });
  return `**${config.question}**\n\n${lines.join("\n")}\n\nWeighted total: **${total.toFixed(2)}**`;
}

/** -------------------- Mutation -------------------- */
export async function toggleVoteWeighted(opts: {
  messageId: string;
  userId: string;
  member: GuildMember | null;
  answerIndex: number;
  multi: boolean;
}) {
  const s = manager.get(opts.messageId);
  if (!s) return;
  const weight = opts.member ? await getWeightForMember(opts.member) : 1;
  const prev = s.voters.get(opts.userId) ?? new Set<number>();
  if (opts.multi) {
    if (prev.has(opts.answerIndex)) prev.delete(opts.answerIndex);
    else prev.add(opts.answerIndex);
    s.voters.set(opts.userId, prev);
  } else {
    const only = new Set<number>();
    only.add(opts.answerIndex);
    s.voters.set(opts.userId, only);
  }
  s.weights.set(opts.userId, weight);
}

/** -------------------- Button Utility -------------------- */
async function disableButtons(msg: Message) {
  const rows = (msg.components ?? []).map(r => {
    const row = new ActionRowBuilder<ButtonBuilder>();
    const components = (r as any).components ?? [];
    for (const c of components) {
      if (c.type !== ComponentType.Button) continue;
      const b = ButtonBuilder.from(c)
        .setDisabled(true)
        .setStyle(ButtonStyle.Secondary);
      row.addComponents(b);
    }
    return row;
  });
  await msg.edit({ components: rows }).catch(() => null);
}

/** -------------------- Archive + Admin Tools -------------------- */
function computeFromArchive(rec: ArchiveRecord): number[] {
  const counts = new Array(rec.config.answers.length).fill(0);
  for (const [uid, list] of Object.entries(rec.votes.voters)) {
    const w = rec.votes.weights?.[uid] ?? 1;
    for (const idx of list) if (idx >= 0 && idx < counts.length) counts[idx] += w;
  }
  return counts;
}
function toCSV(rec: ArchiveRecord) {
  const rows = [["userId", "weight", "choices"]];
  const weights = rec.votes.weights ?? {};
  for (const [uid, choices] of Object.entries(rec.votes.voters))
    rows.push([uid, String(weights[uid] ?? 1), choices.join("|")]);
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function endPoll(i: ChatInputCommandInteraction, messageLink: string) {
  const msg = await resolveMessageFromLink(i, messageLink);
  if (!msg) return "Couldn’t find that message.";

  const s = manager.get(msg.id);
  if (!s) {
    if (!msg.editable) return "Poll not live and cannot edit that message.";
    await disableButtons(msg);
    return "Poll closed (no live state).";
  }

  // permission check
  if (i.user.id !== s.creatorId) {
    const member = await msg.guild!.members.fetch(i.user.id).catch(() => null);
    if (!member?.permissions.has(P.ManageGuild)) return "Only the creator or staff can end this poll.";
  }

  const counts = countWeighted(s.config, s);
  const resultsEmbed = new EmbedBuilder()
    .setTitle("📊 Poll Results")
    .setColor(Colors.Blurple)
    .setDescription(renderResultsFromCounts(s.config, counts));

  await disableButtons(msg);
  await msg.reply({ embeds: [resultsEmbed] }).catch(() => null);

  const rec = await archiveNow(s);
  setCollectorEnded(msg.id);
  manager.delete(msg.id);

  if (rec && s.config.dmCreator) {
    try { await i.user.send({ embeds: [resultsEmbed] }); } catch {}
  }

  return "Poll closed.";
}

export async function showResults(i: ChatInputCommandInteraction, messageLink: string) {
  const msg = await resolveMessageFromLink(i, messageLink);
  if (!msg) return "Couldn’t find that message.";

  const live = manager.get(msg.id);
  if (live) {
    const counts = countWeighted(live.config, live);
    const embed = new EmbedBuilder()
      .setTitle("📊 Current Results")
      .setColor(Colors.Aqua)
      .setDescription(renderResultsFromCounts(live.config, counts));
    await i.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return null;
  }

  const rec = await archiveRead(msg.guild!.id, msg.id);
  if (!rec) return "No results available. (Not archived & not live.)";
  const counts = computeFromArchive(rec);
  const embed = new EmbedBuilder()
    .setTitle("📊 Final Results")
    .setColor(Colors.Aqua)
    .setDescription(renderResultsFromCounts(rec.config, counts));
  await i.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  return null;
}

export async function exportCSV(i: ChatInputCommandInteraction, messageLink: string) {
  const msg = await resolveMessageFromLink(i, messageLink);
  if (!msg) return "Couldn’t find that message.";

  const rec = await archiveRead(msg.guild!.id, msg.id);
  if (!rec) return "No archive found for that poll.";

  await i.followUp({
    files: [{ attachment: Buffer.from(toCSV(rec), "utf8"), name: `poll_${rec.messageId}.csv` }],
    flags: MessageFlags.Ephemeral,
  });
  return null;
}

export async function listLogs(i: ChatInputCommandInteraction, limit = 10) {
  const guildId = i.guild!.id;
  const recents = await archiveListRecent(guildId, limit);
  if (!recents.length) return "No archived polls yet.";

  const lines = recents.map(r => {
    const counts = computeFromArchive(r);
    const total = counts.reduce((a, c) => a + c, 0) || 1;
    const topIdx = counts.indexOf(Math.max(...counts));
    const top = r.config.answers[topIdx];
    const jump = `https://discord.com/channels/${r.guildId}/${r.channelId}/${r.messageId}`;
    return `• [Jump](${jump}) — **${r.config.question}** → Winner: **${top.emoji ? `${top.emoji} ` : ""}${top.label}** (${counts[topIdx].toFixed(2)}/${total.toFixed(2)})`;
  }).join("\n");

  const e = new EmbedBuilder().setTitle("🗂️ Recent Polls").setColor(Colors.Blurple).setDescription(lines);
  await i.followUp({ embeds: [e], flags: MessageFlags.Ephemeral });
  return null;
}

async function archiveNow(s: LiveState): Promise<ArchiveRecord> {
  const votes: VoteSnapshot = {
    voters: Object.fromEntries([...s.voters.entries()].map(([u, set]) => [u, [...set.values()]])),
    weights: Object.fromEntries([...s.weights.entries()]),
  };
  const rec: ArchiveRecord = {
    messageId: s.message.id,
    channelId: s.channelId,
    guildId: s.guildId,
    creatorId: s.creatorId,
    createdAt: s.message.createdTimestamp,
    closedAt: Date.now(),
    config: s.config,
    votes,
  };
  await archiveWrite(rec);
  return rec;
}

async function resolveMessageFromLink(i: ChatInputCommandInteraction, link: string): Promise<Message | null> {
  const m = link.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
  let channelId = "", messageId = "";
  if (m) {
    channelId = m[2];
    messageId = m[3];
  } else {
    const id = link.trim();
    if (!/^\d+$/.test(id)) return null;
    const ch = i.channel as TextChannel;
    try {
      return await ch.messages.fetch(id);
    } catch {}
    return null;
  }
  try {
    const ch = await i.client.channels.fetch(channelId);
    if (!ch || !ch.isTextBased()) return null;
    return await (ch as TextChannel).messages.fetch(messageId);
  } catch {
    return null;
  }
}
