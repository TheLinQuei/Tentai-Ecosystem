// src/commands/lfg.ts
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import { postLfgPanel } from "../modules/lfg";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("lfg")
  .setDescription("Post an LFG panel with dropdowns (Odyssey-styled)")
  .addStringOption(o => o.setName("game").setDescription("Game title").setRequired(true))
  .addStringOption(o => o.setName("mode").setDescription("Mode/Roles (short)").setRequired(true))
  .addStringOption(o => o.setName("window").setDescription("Time window (TZ)").setRequired(true))
  .addIntegerOption(o => o.setName("slots").setDescription("Slots (1–12)").setMinValue(1).setMaxValue(12))
  .addStringOption(o => o.setName("reqs").setDescription("Requirements (optional)"))
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export async function execute(interaction: ChatInputCommandInteraction) {
  console.log(`[LFG] slash invoked by ${interaction.user?.id} in ${interaction.guildId}/${interaction.channelId}`);
  try {
    // ACK FIRST—no conditions before this.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild || interaction.channel?.type !== ChannelType.GuildText) {
      return interaction.editReply("Use this in a standard text channel.");
    }

    const game = interaction.options.getString("game", true);
    const mode = interaction.options.getString("mode", true);
    const timeWindowStr = interaction.options.getString("window", true); // don't use the 'window' identifier later
    const slots = interaction.options.getInteger("slots") ?? 4;
    const reqs = interaction.options.getString("reqs") ?? undefined;

    const voiceChoices = interaction.guild.channels.cache
      .filter(c => c.type === ChannelType.GuildVoice && /squad(-\d+)?$/i.test(c.name))
      .map(c => ({ id: c.id, label: c.name }))
      .slice(0, 8);

    const { message } = await postLfgPanel(interaction.guild, {
      ownerId: interaction.user.id,
      channelId: interaction.channelId,
      game,
      mode,
      timeWindow: timeWindowStr,
      slots,
      reqs,
      voiceChoices,
    });

    return interaction.editReply({ content: `Posted LFG: ${message.url}` });
  } catch (err: any) {
    console.error("[LFG] execute error:", err);
    const msg = typeof err?.message === "string" ? err.message : "Unknown error";
    return interaction.editReply(`Could not post LFG: \`${msg}\``);
  }
}
