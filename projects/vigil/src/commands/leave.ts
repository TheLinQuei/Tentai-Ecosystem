import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { leave } from "../modules/voiceManager";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("leave")
  .setDescription("Vi leaves the voice channel");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  try {
    await leave(interaction.guild);
    await interaction.editReply("Left the channel. Call me back with /join.");
  } catch (e) {
    console.error("Leave error:", e);
    if (interaction.deferred) {
      await interaction.editReply("I wasn’t in a voice channel or something went wrong.");
    } else {
      await interaction.reply({ content: "I wasn’t in a voice channel or something went wrong.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}
