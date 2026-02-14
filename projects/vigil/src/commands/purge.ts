import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags
} from "discord.js";
import {
  sendMassDM,
  resolveKeep,
  exportKeepNames,
} from "../utils/purgeDm";

export const data = new SlashCommandBuilder()
  .setName("purge")
  .setDescription("Purge helpers")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sc) =>
    sc.setName("dm").setDescription("Send the purge DM to all members"),
  )
  // Read-only utilities (no DMs/pings):
  .addSubcommand((sc) =>
    sc.setName("names").setDescription("Preview who clicked “I’m staying” (names only)"),
  )
  .addSubcommand((sc) =>
    sc.setName("export-names").setDescription("Write data/keep-names.txt (names only)"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);

  if (sub === "dm") {
    await interaction.reply({
      content: "Sending DMs… this will take a bit. I’ll update when done.",
      flags: MessageFlags.Ephemeral,
    });
    const { sent, failed } = await sendMassDM(interaction.guild!);
    return interaction.followUp({
      content: `DMs finished. Sent: **${sent}**, Failed: **${failed}**.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === "names") {
    const rows = await resolveKeep(interaction.guild!);
    const preview =
      rows
        .slice(0, 50)
        .map((r) => `• ${r.name}${r.inGuild ? "" : " (left)"}`)
        .join("\n") || "_none_";
    const more =
      rows.length > 50
        ? `\n…and **${rows.length - 50}** more. Use **/purge export-names** for the full list.`
        : "";
    return interaction.reply({
      content: `**Marked to stay (names)** — total **${rows.length}**\n${preview}${more}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === "export-names") {
    const { path, total, left } = await exportKeepNames(interaction.guild!);
    return interaction.reply({
      content: `Exported **${total}** names to \`${path}\`${
        left ? `\nNote: ${left} user(s) are no longer in the guild.` : ""
      }`,
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    content: "Unknown subcommand",
    flags: MessageFlags.Ephemeral,
  });
}
