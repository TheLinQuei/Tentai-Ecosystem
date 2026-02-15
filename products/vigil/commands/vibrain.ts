// src/commands/vibrain.ts
import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
} from "discord.js";
import { memory } from "../modules/memory"; // your memory module
import { CONFIG } from "../config";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("vibrain")
  .setDescription("ViBrain status & diagnostics")
  .addSubcommand(s => s.setName("status").setDescription("Show ViBrain runtime state"))
  .setDMPermission(false);

function bool(x: any) { return x ? "✅" : "⛔"; }

export async function execute(i: ChatInputCommandInteraction) {
  const sub = i.options.getSubcommand();
  if (sub !== "status") { await i.reply({ content: "Unknown subcommand.", flags: MessageFlags.Ephemeral }); return; }

  // Read plausible places these flags live in your codebase.
  // Adjust paths if your config uses different keys.
  const aiCfg = (CONFIG as any)?.AI ?? {};
  const guardian = (CONFIG as any)?.Guardian ?? {};
  const vibrain = (memory as any)?.vibrain ?? {};         // in-memory runtime snapshot
  const longterm = (memory as any)?.longterm ?? {};       // persisted longterm index

  const fields = [
    { name: "Mode", value: "`" + (vibrain.mode ?? process.env.VIBRAIN_MODE ?? "unknown") + "`", inline: true },
    { name: "Persona", value: "`" + (vibrain.persona ?? aiCfg.persona ?? "auto") + "`", inline: true },
    { name: "Intensity", value: "`" + (vibrain.intensity ?? aiCfg.intensity ?? 0) + "`", inline: true },

    { name: "Emotion Engine", value: bool(vibrain.emotionLoaded ?? aiCfg.emotionEnabled), inline: true },
    { name: "Context Engine", value: bool(vibrain.contextLoaded ?? true), inline: true },
    { name: "Safety/Strict", value: "`" + (guardian.mode ?? process.env.GUARDIAN_MODE ?? "normal") + "`", inline: true },

    { name: "Wake Word Required", value: bool(aiCfg.wakeWordRequired), inline: true },
    { name: "Short-term OK", value: bool(!!(vibrain.session?.messages?.length)), inline: true },
    { name: "Long-term Users", value: "`" + (Object.keys(longterm.users ?? {}).length) + "`", inline: true },

    { name: "Self Profile", value: bool(!!longterm.self), inline: true },
    { name: "Safe Mode", value: bool(process.env.SAFE_MODE === "true"), inline: true },
    { name: "NSFW (Global Off)", value: bool(process.env.NSFW === "true"), inline: true },
  ];

  const emb = new EmbedBuilder()
    .setTitle("ViBrain Diagnostics")
    .setColor(Colors.Orange)
    .setDescription("Runtime snapshot of memory, persona, and safety gates.")
    .addFields(fields)
    .setTimestamp(new Date());

  await i.reply({ embeds: [emb], flags: MessageFlags.Ephemeral });
}
