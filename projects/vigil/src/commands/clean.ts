import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits as P,
  MessageFlags,
  Collection,
  Message,
  GuildTextBasedChannel,
  EmbedBuilder,
  Colors,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("clean")
  .setDescription("Bulk delete messages from channel")
  .addIntegerOption(o => o
    .setName("count")
    .setDescription("Number of messages to delete (max 100)")
    .setRequired(true)
    .setMinValue(1)
    .setMaxValue(100))
  .addUserOption(o => o
    .setName("user")
    .setDescription("Only delete messages from this user"))
  .addBooleanOption(o => o
    .setName("bots")
    .setDescription("Only delete bot messages"))
  .addStringOption(o => o
    .setName("pattern")
    .setDescription("Only delete messages containing this text"))
  .addIntegerOption(o => o
    .setName("older_than")
    .setDescription("Only delete messages older than X minutes")
    .setMinValue(1))
  .addBooleanOption(o => o
    .setName("pinned")
    .setDescription("Include pinned messages (default: false)"))
  .setDefaultMemberPermissions(P.ManageMessages)
  .setDMPermission(false);

export async function execute(i: ChatInputCommandInteraction) {
  // Permission check
  if (!i.memberPermissions?.has(P.ManageMessages)) {
    await i.reply({
      content: "❌ You need **Manage Messages** permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await i.deferReply({ flags: MessageFlags.Ephemeral });

  const count = i.options.getInteger("count", true);
  const targetUser = i.options.getUser("user");
  const botsOnly = i.options.getBoolean("bots") ?? false;
  const pattern = i.options.getString("pattern");
  const olderThanMin = i.options.getInteger("older_than");
  const includePinned = i.options.getBoolean("pinned") ?? false;

  const channel = i.channel as GuildTextBasedChannel;
  if (!channel) {
    await i.editReply("❌ This command can only be used in a server text channel.");
    return;
  }

  // Bot permission check
  const me = await i.guild!.members.fetchMe();
  const perms = channel.permissionsFor(me);
  if (!perms?.has(P.ManageMessages)) {
    await i.editReply("❌ I need **Manage Messages** permission in this channel.");
    return;
  }

  try {
    // Fetch messages (Discord limit: can only fetch 100 at a time)
    const fetchLimit = Math.min(count * 3, 100); // Fetch more to account for filters
    const messages = await channel.messages.fetch({ limit: fetchLimit });

    // Filter messages
    let filtered = messages.filter((msg: Message) => {
      // Skip if older than 14 days (Discord API limitation)
      const age = Date.now() - msg.createdTimestamp;
      if (age > 14 * 24 * 60 * 60 * 1000) return false;

      // Skip pinned messages unless explicitly included
      if (msg.pinned && !includePinned) return false;

      // Filter by user
      if (targetUser && msg.author.id !== targetUser.id) return false;

      // Filter by bots
      if (botsOnly && !msg.author.bot) return false;

      // Filter by pattern
      if (pattern && !msg.content.toLowerCase().includes(pattern.toLowerCase())) return false;

      // Filter by age
      if (olderThanMin) {
        const minAge = olderThanMin * 60 * 1000;
        if (age < minAge) return false;
      }

      return true;
    });

    // Limit to requested count
    filtered = new Collection(
      Array.from(filtered.entries()).slice(0, count)
    );

    if (filtered.size === 0) {
      await i.editReply("❌ No messages found matching your criteria.");
      return;
    }

    // Build confirmation message
    const filters: string[] = [];
    if (targetUser) filters.push(`User: ${targetUser.tag}`);
    if (botsOnly) filters.push("Bots only");
    if (pattern) filters.push(`Pattern: "${pattern}"`);
    if (olderThanMin) filters.push(`Older than: ${olderThanMin}m`);
    if (includePinned) filters.push("Including pinned");

    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle("⚠️ Confirm Deletion")
      .setDescription(
        `You are about to delete **${filtered.size}** message${filtered.size !== 1 ? "s" : ""} from ${channel}.\n\n` +
        `**Filters:**\n${filters.length > 0 ? filters.map(f => `• ${f}`).join("\n") : "• None"}\n\n` +
        `**Warning:** This action cannot be undone!`
      )
      .setFooter({ text: "You have 30 seconds to confirm or cancel." });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("clean_confirm")
        .setLabel("✅ Confirm Delete")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("clean_cancel")
        .setLabel("❌ Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    const confirmMsg = await i.editReply({
      embeds: [embed],
      components: [row],
    });

    // Wait for confirmation
    try {
      const confirmation = await confirmMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (btn) => btn.user.id === i.user.id,
        time: 30_000,
      });

      if (confirmation.customId === "clean_cancel") {
        await confirmation.update({
          content: "❎ Deletion cancelled.",
          embeds: [],
          components: [],
        });
        return;
      }

      await confirmation.update({
        content: "🗑️ Deleting messages...",
        embeds: [],
        components: [],
      });

      // Perform bulk delete
      const deleted = await channel.bulkDelete(filtered, true);

      // Success message
      const successEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("✅ Messages Deleted")
        .setDescription(
          `Successfully deleted **${deleted.size}** message${deleted.size !== 1 ? "s" : ""} from ${channel}.`
        )
        .addFields({
          name: "Filters Applied",
          value: filters.length > 0 ? filters.map(f => `• ${f}`).join("\n") : "• None",
        })
        .setTimestamp();

      await i.editReply({ embeds: [successEmbed] });

      // Log to audit (if you have an audit system)
      console.log(
        `[clean] ${i.user.tag} (${i.user.id}) deleted ${deleted.size} messages in ${channel.name} (${channel.id})` +
        (filters.length > 0 ? ` with filters: ${filters.join(", ")}` : "")
      );

    } catch (error: any) {
      if (error.code === "INTERACTION_COLLECTOR_ERROR") {
        await i.editReply({
          content: "⏱️ Confirmation timeout. Deletion cancelled.",
          embeds: [],
          components: [],
        });
      } else {
        throw error;
      }
    }

  } catch (error: any) {
    console.error("[clean] Error:", error);
    const errorMsg = error.message?.includes("Missing Permissions")
      ? "❌ I don't have permission to delete messages in this channel."
      : error.message?.includes("Unknown Message")
      ? "❌ Some messages couldn't be deleted (they may be too old or already deleted)."
      : `❌ An error occurred: ${error.message || "Unknown error"}`;

    if (i.deferred) {
      await i.editReply({ content: errorMsg, embeds: [], components: [] });
    } else {
      await i.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
    }
  }
}
