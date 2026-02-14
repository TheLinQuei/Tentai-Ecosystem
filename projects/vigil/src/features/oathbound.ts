// src/features/oathbound.ts
import {
  ChannelType,
  Client,
  Colors,
  EmbedBuilder,
  Events,
  PartialGuildMember,
  PermissionFlagsBits as P,
} from "discord.js";
import type { GuildMember } from 'discord.js';

const OATHBOUND_ROLE_ID = process.env.OATH_ROLE_ID || "1410146537413017610";
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || "1409730904078680125";
const MODLOG_CHANNEL_ID = "1409373169655222343";

const ordinal = (n: number) => {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

async function addOathbound(member: GuildMember): Promise<boolean> {
  if (member.roles.cache.has(OATHBOUND_ROLE_ID)) return false;

  const me = member.guild.members.me;
  if (!me?.permissions.has(P.ManageRoles)) return false;

  const role = await member.guild.roles.fetch(OATHBOUND_ROLE_ID).catch(() => null);
  if (!role) return false;
  if (me.roles.highest.position <= role.position) return false;

  await member.roles.add(role, "Completed membership screening");
  return true;
}

async function sendWelcome(member: GuildMember) {
  const ch = await member.client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return;

  const count = member.guild.memberCount;
  const ord = ordinal(count);
  const guildIcon = member.guild.iconURL({ size: 256 }) ?? undefined;

  const embed = new EmbedBuilder()
    .setColor( Colors.Gold )
    .setAuthor({ name: member.guild.name, iconURL: guildIcon })
    .setTitle(`Welcome, ${member.displayName}.`)
    .setDescription(
      `You are the **${ord}** member of The Odyssey.\n` +
      `The doors are open—mind the craft, carry the story.`
    )
    .setFooter({ text: "Respect the work. Leave your mark." })
    .setTimestamp();

  await (ch).send({ content: `${member}`, embeds: [embed] }).catch(() => null);
}

async function sendFarewell(member: GuildMember | PartialGuildMember) {
  const ch = await member.client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return;

  const tag = ("user" in member && member.user) ? member.user.tag : `${member.id}`;
  const displayName = "displayName" in member ? member.displayName : tag;
  const guildIcon = member.guild.iconURL({ size: 256 }) ?? undefined;

  const embed = new EmbedBuilder()
    .setColor(Colors.DarkGrey)
    .setAuthor({ name: member.guild.name, iconURL: guildIcon })
    .setTitle("Hate to see you go")
    .setDescription(
      `**${displayName}** has left The Odyssey.\n` +
      `May your path find you well.`
    )
    .setFooter({ text: "The doors remain open should you return." })
    .setTimestamp();

  await (ch).send({ embeds: [embed] }).catch(() => null);
}

async function logLeave(member: GuildMember | PartialGuildMember) {
  const ch = await member.client.channels.fetch(MODLOG_CHANNEL_ID).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return;

  const tag = ("user" in member && member.user) ? member.user.tag : `(unknown)`;
  const id = member.id;
  const joined =
    "joinedAt" in member && member.joinedAt
      ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`
      : "unknown";

  const embed = new EmbedBuilder()
    .setColor( Colors.Red )
    .setTitle("Member Left")
    .setDescription(`**${tag}** (<@${id}>) left the server.`)
    .addFields(
      { name: "User ID", value: id, inline: true },
      { name: "Joined", value: joined, inline: true }
    )
    .setTimestamp();

  await (ch).send({ embeds: [embed] }).catch(() => null);
}

export function registerOathboundOnboarding(client: Client) {
  // Completed checkbox + submit (pending: true -> false)
  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    if (oldM.pending && !newM.pending) {
      const added = await addOathbound(newM);
      if (added) await sendWelcome(newM);
    }
  });

  // Safety net if screening is off / already passed
  client.on(Events.GuildMemberAdd, async (member) => {
    if (!member.pending) {
      const added = await addOathbound(member);
      if (added) await sendWelcome(member);
    }
  });

  // Leave notification -> public farewell + mod logs
  client.on(Events.GuildMemberRemove, async (member) => {
    await sendFarewell(member);
    await logLeave(member);
  });
}
