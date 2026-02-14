import {
  SlashCommandBuilder, ChatInputCommandInteraction, ChannelType, PermissionFlagsBits
} from "discord.js";
import { setPref, getPref } from "../memory/vibrainStore";
import { rescheduleXpReminders } from "../features/xp-reminders";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("xp-reminder")
  .setDescription("Configure XP (points) reminders")
  .addSubcommand(s =>
    s.setName("set")
      .setDescription("Set channel/times/role")
      .addChannelOption(o => o.setName("channel").setDescription("Channel for reminders").addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName("timezone").setDescription("IANA TZ, e.g. America/Chicago").setRequired(true))
      .addStringOption(o => o.setName("daily").setDescription("HH:MM 24h (e.g. 09:00)").setRequired(true))
      .addStringOption(o => o.setName("weekly").setDescription("DAY@HH:MM (e.g. Sun@12:00)").setRequired(true))
      .addRoleOption(o => o.setName("role").setDescription("Optional role to ping")))
  .addSubcommand(s => s.setName("enable").setDescription("Enable reminders"))
  .addSubcommand(s => s.setName("disable").setDescription("Disable reminders"))
  .addSubcommand(s => s.setName("show").setDescription("Show current config"))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.inGuild() || !i.guild) return i.reply({ content: "Run in a server.", flags: MessageFlags.Ephemeral });
  const sub = i.options.getSubcommand();

  const key = "xp.points.reminders";
  const cur = getPref<any>(i.guild.id, key, {
    enabled: false, tz: "UTC", daily: "09:00", weekly: "Sun@12:00", channelId: null, roleId: null,
  });

  if (sub === "set") {
    const ch = i.options.getChannel("channel", true);
    const tz = i.options.getString("timezone", true);
    const daily = i.options.getString("daily", true);
    const weekly = i.options.getString("weekly", true);
    const role = i.options.getRole("role") ?? null;

    // light validation
    if (!/^\d{2}:\d{2}$/.test(daily)) return i.reply({ content: "Daily must be HH:MM (24h).", flags: MessageFlags.Ephemeral });
    if (!/^(sun|mon|tue|wed|thu|fri|sat)@\d{2}:\d{2}$/i.test(weekly)) return i.reply({ content: "Weekly must be DAY@HH:MM (e.g. Sun@12:00).", flags: MessageFlags.Ephemeral });

    const next = { ...cur, channelId: ch.id, tz, daily, weekly, roleId: role?.id ?? null };
    setPref(i.guild.id, key, next);
    await rescheduleXpReminders(i.client, i.guild.id); // rebuild jobs for this guild
    return i.reply({ content: `Saved. Reminders will post in <#${ch.id}> (${tz}).`, flags: MessageFlags.Ephemeral });
  }

  if (sub === "enable") {
    setPref(i.guild.id, key, { ...cur, enabled: true });
    await rescheduleXpReminders(i.client, i.guild.id);
    return i.reply({ content: "XP reminders enabled.", flags: MessageFlags.Ephemeral });
  }
  if (sub === "disable") {
    setPref(i.guild.id, key, { ...cur, enabled: false });
    await rescheduleXpReminders(i.client, i.guild.id);
    return i.reply({ content: "XP reminders disabled.", flags: MessageFlags.Ephemeral });
  }
  if (sub === "show") {
    const r = getPref<any>(i.guild.id, key, null);
    if (!r) return i.reply({ content: "No reminder config set.", flags: MessageFlags.Ephemeral });
    const roleStr = r.roleId ? `<@&${r.roleId}>` : "—";
    const chStr = r.channelId ? `<#${r.channelId}>` : "—";
    return i.reply({
      content: `Enabled: **${r.enabled ? "yes" : "no"}**\nChannel: ${chStr}\nTZ: **${r.tz}**\nDaily: **${r.daily}**\nWeekly: **${r.weekly}**\nPing: ${roleStr}`,
      flags: MessageFlags.Ephemeral
    });
  }
}
