// src/commands/skip.ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPlayerForGuild } from "../features/music";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("skip")
  .setDescription("Skip the current track.");

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const guildId = interaction.guildId!;
    const gp = getPlayerForGuild(guildId);
    
    if (!gp) {
      await interaction.reply({ content: "No music player found.", flags: MessageFlags.Ephemeral });
      return;
    }

    const now = gp.getCurrent();
    if (!now) {
      await interaction.reply({ content: "Nothing is playing.", flags: MessageFlags.Ephemeral });
      return;
    }
    
    await gp.skip();
    await interaction.reply(`⏭️ Skipped **${now.title}**`);
  } catch (e: any) {
    await interaction.reply({ content: `Couldn't skip: ${e?.message || e}`, flags: MessageFlags.Ephemeral });
  }
}
