import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildMember,
  TextChannel,
  
} from "discord.js";
import { join } from "../modules/voiceManager";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join the voice channel I'm in, or connect me here.");

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const member: GuildMember = await interaction.guild.members.fetch(interaction.user.id);
  const vc = member.voice?.channel;
  if (!vc) {
    await interaction.reply({ content: "Join a voice channel first, then use /join.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  try {
    const textChan = (interaction.channel ?? undefined) as TextChannel | undefined;
    await join(vc, textChan);
    await interaction.editReply('I’m in. Listening now. Say “Vi, …” to talk to me.');
  } catch (e) {
    console.error("Join error:", e);
    if (interaction.deferred) {
      await interaction.editReply("I couldn’t join that voice channel. Do I have permission?");
    } else {
      await interaction.reply({ content: "I couldn’t join that voice channel. Do I have permission?", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}
