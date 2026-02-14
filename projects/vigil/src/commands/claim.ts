// src/commands/claim.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { getPrisma } from "../utils/prisma";
import { getEventMultipliers } from "./event";
import { MessageFlags } from "discord.js";

const prisma = getPrisma();

export const data = new SlashCommandBuilder()
  .setName("claim")
  .setDescription("Claim special bonuses")
  .addSubcommand(sc => sc
    .setName("bonus")
    .setDescription("Claim one-time event bonus XP"));

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) {
    await i.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = i.options.getSubcommand();

  if (sub === "bonus") {
    const event = getEventMultipliers();
    
    if (!event.active) {
      await i.reply({ 
        content: "No event is currently active. Check announcements for upcoming events!", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    if (!event.canClaimBonus(i.user.id, i.guildId)) {
      await i.reply({ 
        content: "You've already claimed your event bonus!", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Grant bonus XP
    const bonusXp = event.oneTimeBonus;
    
    await prisma.xpProfile.upsert({
      where: { userId_guildId: { userId: i.user.id, guildId: i.guildId } },
      create: { 
        userId: i.user.id, 
        guildId: i.guildId, 
        xp: bonusXp,
        level: calculateLevel(bonusXp),
      },
      update: { 
        xp: { increment: bonusXp },
      },
    });

    // Update level based on new XP
    const profile = await prisma.xpProfile.findUnique({
      where: { userId_guildId: { userId: i.user.id, guildId: i.guildId } },
    });

    if (profile) {
      const newLevel = calculateLevel(profile.xp);
      if (newLevel !== profile.level) {
        await prisma.xpProfile.update({
          where: { userId_guildId: { userId: i.user.id, guildId: i.guildId } },
          data: { level: newLevel },
        });
      }
    }

    // Mark as claimed
    event.markBonusClaimed(i.user.id, i.guildId);

    // Log the bonus
    await prisma.xpEvent.create({
      data: {
        userId: i.user.id,
        guildId: i.guildId,
        source: "event_bonus",
        delta: bonusXp,
        meta: { event: "phoenix_rising" },
      },
    });

    const embed = new EmbedBuilder()
      .setColor(Colors.Gold)
      .setTitle("🎉 Bonus Claimed!")
      .setDescription([
        `You've received **${bonusXp.toLocaleString()} XP**!`,
        "",
        `Your new level: **${profile ? profile.level : 0}**`,
        "",
        `Keep chatting and participating to earn even more with **${event.xpMultiplier}x XP** and **${event.shardMultiplier}x Shards**!`,
      ].join("\n"));

    await i.reply({ embeds: [embed] });
  }
}

// Level calculation (matches progression.ts)
function calculateLevel(totalXp: number): number {
  let level = 0;
  let xpNeeded = 5 * level * level + 50 * level; // 5*level^2 + 50*level
  let xpRemaining = totalXp;

  while (xpRemaining >= xpNeeded) {
    xpRemaining -= xpNeeded;
    level++;
    xpNeeded = 5 * level * level + 50 * level;
  }

  return level;
}
