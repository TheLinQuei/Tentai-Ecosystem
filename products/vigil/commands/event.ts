// src/commands/event.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits as P,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { getPrisma } from "../utils/prisma";
import { MessageFlags } from "discord.js";

const prisma = getPrisma();

// Event configuration (set via admin commands)
let eventActive = false;
let eventXpMultiplier = 1;
let eventShardMultiplier = 1;
let eventDailyBonus = 0;
let eventWeeklyBonus = 0;
let eventEndTime: Date | null = null;
let oneTimeBonus = 5000; // XP bonus for active members
const oneTimeBonusClaimed = new Set<string>(); // userId:guildId

export const data = new SlashCommandBuilder()
  .setName("event")
  .setDescription("XP/Shard event management")
  .setDefaultMemberPermissions(P.Administrator)
  .addSubcommand(sc => sc
    .setName("start")
    .setDescription("Start an XP/Shard boost event")
    .addIntegerOption(o => o.setName("xp_multiplier").setDescription("XP multiplier (2 = 2x, 3 = 3x, 4 = 4x)").setRequired(true).setMinValue(1).setMaxValue(10))
    .addIntegerOption(o => o.setName("shard_multiplier").setDescription("Shard multiplier").setRequired(true).setMinValue(1).setMaxValue(10))
    .addIntegerOption(o => o.setName("duration_hours").setDescription("Event duration in hours").setRequired(true).setMinValue(1).setMaxValue(168))
    .addIntegerOption(o => o.setName("daily_bonus").setDescription("Extra daily bonus Shards").setMinValue(0))
    .addIntegerOption(o => o.setName("weekly_bonus").setDescription("Extra weekly bonus Shards").setMinValue(0)))
  .addSubcommand(sc => sc
    .setName("stop")
    .setDescription("End the current event"))
  .addSubcommand(sc => sc
    .setName("status")
    .setDescription("Check current event status"))
  .addSubcommand(sc => sc
    .setName("announce")
    .setDescription("Generate announcement embed for the event"))
  .addSubcommand(sc => sc
    .setName("bonus")
    .setDescription("Set one-time bonus XP for active members")
    .addIntegerOption(o => o.setName("xp").setDescription("Bonus XP amount").setRequired(true).setMinValue(0)))
  .addSubcommand(sc => sc
    .setName("reset")
    .setDescription("Reset bonus claim tracker (allows reclaims)"));

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) {
    await i.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = i.options.getSubcommand();

  if (sub === "start") {
    const xpMult = i.options.getInteger("xp_multiplier", true);
    const shardMult = i.options.getInteger("shard_multiplier", true);
    const hours = i.options.getInteger("duration_hours", true);
    const dailyBonus = i.options.getInteger("daily_bonus") ?? 0;
    const weeklyBonus = i.options.getInteger("weekly_bonus") ?? 0;

    eventActive = true;
    eventXpMultiplier = xpMult;
    eventShardMultiplier = shardMult;
    eventDailyBonus = dailyBonus;
    eventWeeklyBonus = weeklyBonus;
    eventEndTime = new Date(Date.now() + hours * 60 * 60 * 1000);

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("🎉 Event Started!")
      .setDescription([
        `**XP Multiplier:** ${xpMult}x`,
        `**Shard Multiplier:** ${shardMult}x`,
        dailyBonus > 0 ? `**Daily Bonus:** +${dailyBonus} Shards` : "",
        weeklyBonus > 0 ? `**Weekly Bonus:** +${weeklyBonus} Shards` : "",
        `**Duration:** ${hours} hours`,
        `**Ends:** <t:${Math.floor(eventEndTime.getTime() / 1000)}:F>`,
      ].filter(Boolean).join("\n"));

    await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "stop") {
    eventActive = false;
    eventXpMultiplier = 1;
    eventShardMultiplier = 1;
    eventDailyBonus = 0;
    eventWeeklyBonus = 0;
    eventEndTime = null;

    await i.reply({ content: "✅ Event ended. All bonuses reset to 1x.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "status") {
    if (!eventActive) {
      await i.reply({ content: "No event is currently active.", flags: MessageFlags.Ephemeral });
      return;
    }

    const remaining = eventEndTime ? Math.max(0, eventEndTime.getTime() - Date.now()) : 0;
    const remainingHours = Math.floor(remaining / (1000 * 60 * 60));
    const remainingMins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("🎉 Active Event")
      .setDescription([
        `**XP Multiplier:** ${eventXpMultiplier}x`,
        `**Shard Multiplier:** ${eventShardMultiplier}x`,
        eventDailyBonus > 0 ? `**Daily Bonus:** +${eventDailyBonus} Shards` : "",
        eventWeeklyBonus > 0 ? `**Weekly Bonus:** +${eventWeeklyBonus} Shards` : "",
        `**Time Remaining:** ${remainingHours}h ${remainingMins}m`,
        `**Bonus Claims:** ${oneTimeBonusClaimed.size} members`,
      ].filter(Boolean).join("\n"));

    await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "announce") {
    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("🎉 RECOVERY EVENT: Phoenix Rising 🎉")
      .setDescription([
        "**Important Announcement**",
        "",
        "Due to a database migration issue, all XP and Shard progress was reset. We know this is frustrating, and we're deeply sorry.",
        "",
        "**To make it right, we're launching a massive recovery event:**",
        "",
        `🔥 **${eventXpMultiplier}x XP** on all activities`,
        `💎 **${eventShardMultiplier}x Shards** on all claims`,
        eventDailyBonus > 0 ? `📅 **/daily** boosted to **+${eventDailyBonus} bonus Shards**` : "",
        eventWeeklyBonus > 0 ? `📆 **/weekly** boosted to **+${eventWeeklyBonus} bonus Shards**` : "",
        oneTimeBonus > 0 ? `⚡ **One-time ${oneTimeBonus.toLocaleString()} XP bonus** - Use \`/claim bonus\` ` : "",
        "",
        eventEndTime ? `**Event runs until:** <t:${Math.floor(eventEndTime.getTime() / 1000)}:F>` : "",
        "",
        "This is your chance to recover and even exceed where you were. Let's rebuild together! 🚀",
      ].filter(Boolean).join("\n"))
      .setFooter({ text: "Thank you for your patience and understanding." });

    await i.reply({ embeds: [embed] });
    return;
  }

  if (sub === "bonus") {
    const xp = i.options.getInteger("xp", true);
    oneTimeBonus = xp;
    await i.reply({ content: `✅ One-time bonus set to **${xp.toLocaleString()} XP**`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (sub === "reset") {
    oneTimeBonusClaimed.clear();
    await i.reply({ content: `✅ Bonus claim tracker reset. All members can claim again.`, flags: MessageFlags.Ephemeral });
    return;
  }
}

// Export event state for other modules to check
export function getEventMultipliers() {
  // Auto-expire event
  if (eventActive && eventEndTime && Date.now() > eventEndTime.getTime()) {
    eventActive = false;
    eventXpMultiplier = 1;
    eventShardMultiplier = 1;
    eventDailyBonus = 0;
    eventWeeklyBonus = 0;
    eventEndTime = null;
  }

  return {
    active: eventActive,
    xpMultiplier: eventXpMultiplier,
    shardMultiplier: eventShardMultiplier,
    dailyBonus: eventDailyBonus,
    weeklyBonus: eventWeeklyBonus,
    oneTimeBonus,
    canClaimBonus: (userId: string, guildId: string) => !oneTimeBonusClaimed.has(`${userId}:${guildId}`),
    markBonusClaimed: (userId: string, guildId: string) => oneTimeBonusClaimed.add(`${userId}:${guildId}`),
  };
}
