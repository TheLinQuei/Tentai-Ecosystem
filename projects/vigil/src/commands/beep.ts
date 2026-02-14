import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import {
  getVoiceConnection,
  createAudioResource,
  StreamType,
  createAudioPlayer,
  AudioPlayerStatus,
} from "@discordjs/voice";
import { Readable } from "node:stream";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("beep")
  .setDescription("Audio test: plays a short 440Hz beep");

function makeBeep(durationMs = 800, freq = 440, sampleRate = 48000, amp = 0.2): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buf = Buffer.alloc(samples * 2 * 2);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * amp;
    const val = (Math.max(-1, Math.min(1, sample)) * 32767) | 0;
    buf.writeInt16LE(val, (i * 4) + 0);
    buf.writeInt16LE(val, (i * 4) + 2);
  }
  return buf;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }
  const conn = getVoiceConnection(interaction.guildId);
  if (!conn) {
    await interaction.reply({ content: "I need to be in a voice channel. Use /join first.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  const pcm = makeBeep();
  let player: any = (conn as any).state?.subscription?.player;
  if (!player) {
    player = createAudioPlayer();
    conn.subscribe(player);
  }
  console.log(`[beep] playing ${pcm.length} bytes stereo PCM`);
  const res = createAudioResource(Readable.from(pcm), { inputType: StreamType.Raw });
  player.play(res);
  player.once(AudioPlayerStatus.Idle, () => {});
  await interaction.editReply("Beep sent.");
}
