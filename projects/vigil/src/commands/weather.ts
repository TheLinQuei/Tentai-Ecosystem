// src/commands/weather.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { getCurrentWeather } from "../modules/weather";

export const data = new SlashCommandBuilder()
  .setName("weather")
  .setDescription("Get current weather for a location")
  .addStringOption(o =>
    o.setName("location").setDescription("City, State/Country (e.g., 'Chicago, IL')").setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export async function execute(interaction: ChatInputCommandInteraction) {
  const q = interaction.options.getString("location", true);
  await interaction.deferReply();
  try {
    const line = await getCurrentWeather(q);
    await interaction.editReply({ content: line });
  } catch (e: any) {
    await interaction.editReply({ content: `Weather error: ${e?.message || e}` });
  }
}
