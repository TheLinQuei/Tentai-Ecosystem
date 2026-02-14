import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { setPref, getPref } from "../memory/vibrainStore";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("xp")
  .setDescription("XP Lab (experiments)")
  .addSubcommand(s =>
    s.setName("init")
      .setDescription("Create or configure the XP Lab channel")
      .addStringOption(o =>
        o.setName("name")
          .setDescription("Channel name (default: xplab)")
          .setRequired(false),
      ),
  )
  .addSubcommand(s =>
    s.setName("propose")
      .setDescription("Create an XP Lab proposal")
      .addStringOption(o => o.setName("title").setDescription("Title").setRequired(true))
      .addStringOption(o => o.setName("goal").setDescription("What we’re improving/learning").setRequired(true))
      .addStringOption(o => o.setName("scope").setDescription("Scope / constraints").setRequired(true))
      .addStringOption(o => o.setName("timebox").setDescription("Ex: 1 week").setRequired(true))
      .addStringOption(o => o.setName("success").setDescription("Metric / finish line").setRequired(true)),
  );

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.inGuild() || !i.guild) {
    await i.reply({ content: "Run this in a server.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = i.options.getSubcommand();

  if (sub === "init") {
    const member = await i.guild.members.fetch(i.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await i.reply({ content: "You need Manage Channels to run this.", flags: MessageFlags.Ephemeral });
      return;
    }

    const name =
      i.options
        .getString("name")
        ?.toLowerCase()
        .replace(/[^a-z0-9-_]/g, "") || "xplab";

    let ch = i.guild.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name === name,
    ) as TextChannel | undefined;

    if (!ch) {
      ch = (await i.guild.channels.create({
        name,
        type: ChannelType.GuildText,
        topic:
          "Experiments, improvements, learnings. Propose → discuss → decide → log.",
        rateLimitPerUser: 10,
        permissionOverwrites: [
          {
            id: i.guild.roles.everyone,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.CreatePublicThreads,
            ],
          },
        ],
      }));
    }

    const header = new EmbedBuilder()
      .setTitle("XP Lab: Experiments & Improvements")
      .setDescription(
        [
          "**Post format**",
          "[XP] Title",
          "- Goal:",
          "- Scope:",
          "- Owner:",
          "- Timebox:",
          "- Success metric:",
          "",
          "Use the buttons to mark status. One proposal = one thread.",
        ].join("\n"),
      )
      .setColor(0xF5A623);

    const msg = await ch.send({ embeds: [header] });
    await msg.pin().catch(() => {});

    // store under a distinct key so it doesn't collide with points-#xp config
    setPref(i.guild.id, "xplab.channelId", ch.id);

    await i.reply({
      content: `Experiments channel ready: <#${ch.id}>`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "propose") {
    const labId = getPref<string>(i.guild.id, "xplab.channelId");
    const target =
      (labId && i.guild.channels.cache.get(labId)) || i.channel;

    if (!target || target.type !== ChannelType.GuildText) {
      await i.reply({
        content:
          "No XP Lab channel set. Run `/xp init` (optionally with `name:xplab`).",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const channel = target;

    const title = i.options.getString("title", true);
    const goal = i.options.getString("goal", true);
    const scope = i.options.getString("scope", true);
    const timebox = i.options.getString("timebox", true);
    const success = i.options.getString("success", true);

    const embed = new EmbedBuilder()
      .setTitle(`[XP] ${title}`)
      .setDescription(
        `**Goal:** ${goal}\n**Scope:** ${scope}\n**Owner:** <@${i.user.id}>\n**Timebox:** ${timebox}\n**Success:** ${success}`,
      )
      .setFooter({ text: "Use the buttons below to update status." })
      .setColor(0x5ac8fa);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("xp:accept")
        .setLabel("Accept")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("xp:reject")
        .setLabel("Reject")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("xp:ship")
        .setLabel("Ship/Log")
        .setStyle(ButtonStyle.Primary),
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });

    try {
      const thread = await msg.startThread({
        name: `[XP] ${title}`,
        autoArchiveDuration: 1440,
      });
      await thread.send(`Discussion for **${title}**. Keep updates here.`);
      await i.reply({ content: `Created: <#${thread.id}>`, flags: MessageFlags.Ephemeral });
    } catch {
      await i.reply({
        content:
          "Created the proposal, but I couldn’t start a thread. Check my thread permissions.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }
}
