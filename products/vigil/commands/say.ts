import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { speakToPcm } from "../modules/tts";
import {
  StreamType,
  createAudioResource,
  getVoiceConnection,
  createAudioPlayer,
  AudioPlayerStatus,
} from "@discordjs/voice";
import { Readable } from "node:stream";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("say")
  .setDescription("Make Vi speak a phrase out loud")
  .addStringOption((opt) =>
    opt.setName("text").setDescription("What should I say?").setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const text = interaction.options.getString("text", true);
  const conn = getVoiceConnection(interaction.guildId);
  if (!conn) {
    await interaction.reply({ content: "I need to be in a voice channel. Use /join first.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  try {
    const pcm = await speakToPcm(text);
    if (!pcm) {
      await interaction.editReply("TTS failed, but I can still type it: " + text);
      return;
    }

    let player: any = (conn as any).state?.subscription?.player;
    if (!player) {
      player = createAudioPlayer();
      conn.subscribe(player);
    }

    console.log(`[say] playing ${pcm.length} bytes stereo PCM`);
    const res = createAudioResource(Readable.from(pcm), { inputType: StreamType.Raw });
    player.play(res);
    player.once(AudioPlayerStatus.Idle, () => {});
    await interaction.editReply("Speaking now.");
  } catch (e) {
    console.error("Say error:", e);
    if (interaction.deferred) {
      await interaction.editReply("I couldn’t speak that. Check logs.");
    } else {
      await interaction.reply({ content: "I couldn’t speak that. Check logs.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}
