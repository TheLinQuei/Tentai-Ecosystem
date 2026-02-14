// src/features/capabilities.ts
import {
  SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder,
} from "discord.js";
import { probeCapabilities } from "../core/capabilities";
import { MessageFlags } from "discord.js";

function chunkStrings(items: string[], max = 1000): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const s of items) {
    if ((cur.length ? cur.length + 2 : 0) + s.length > max) {
      if (cur) chunks.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur}, ${s}` : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export const data = new SlashCommandBuilder()
  .setName("capabilities")
  .setDescription("Show what Vi is wired to do right now.");

export async function execute(i: ChatInputCommandInteraction) {
  const caps = await probeCapabilities(i.client);

  // Fetch currently registered commands (guild if present; otherwise global)
  let cmdNames: string[] = [];
  try {
    if (i.inGuild() && i.guild) {
      const fetched = await i.guild.commands.fetch();
      cmdNames = [...fetched.values()].map(c => c.name).sort();
    } else if (i.client.application) {
      const fetched = await i.client.application.commands.fetch();
      cmdNames = [...fetched.values()].map(c => c.name).sort();
    }
  } catch {
    // ignore fetch failures; we'll show none
  }

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Vi — Live Capabilities")
    .setDescription("Runtime truth. No marketing.")
    .addFields(
      { name: "Node", value: caps.node, inline: true },
      { name: "OS", value: caps.os, inline: true },
      { name: "Uptime", value: `${caps.uptimeSec}s`, inline: true },

      { name: "Shards", value: String(caps.shards), inline: true },
      { name: "Guilds", value: String(caps.guilds), inline: true },
      { name: "Users (approx.)", value: String(caps.usersApprox), inline: true },

      { name: "Intents", value: caps.intents.join(", ") || "—", inline: false },

      { name: "AI Provider", value: caps.aiProviderConfigured ? "✅ configured" : "❌ missing", inline: true },
      { name: "Vision", value: caps.visionEnabled ? "✅ enabled" : "❌ disabled", inline: true },
      { name: "Owner DM", value: caps.ownerDMReachable ? "✅ reachable" : "❌ unavailable", inline: true },
    )
    .setTimestamp(new Date());

  // Add command list in safe chunks (1024 char per field max)
  if (cmdNames.length) {
    const chunks = chunkStrings(cmdNames, 1000); // 1000 leaves padding
    chunks.slice(0, 10).forEach((chunk, idx) => {
      const label = idx === 0
        ? `Slash Commands (${cmdNames.length})`
        : `Slash Commands (cont. ${idx + 1})`;
      embed.addFields({ name: label, value: chunk });
    });
  } else {
    embed.addFields({ name: "Slash Commands (0)", value: "—" });
  }

  await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
