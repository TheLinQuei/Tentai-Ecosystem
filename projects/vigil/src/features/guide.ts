import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder,
  StringSelectMenuOptionBuilder, ButtonStyle, ComponentType, PermissionFlagsBits as P
} from "discord.js";
import { listUiElements } from "../core/uiRegistry";
import { probeCapabilities } from "../core/capabilities";
import { MessageFlags } from "discord.js";

function chunk<T>(arr: T[], size: number) { const out: T[][] = []; for (let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }

export const data = new SlashCommandBuilder()
  .setName("vi")
  .setDescription("Interactive guide to Vi (commands, UI, AI usage).")
  .addBooleanOption(o => o.setName("public").setDescription("Show to everyone (default: ephemeral)"))
  .addStringOption(o => o.setName("section").setDescription("Jump to a section").addChoices(
    { name: "Getting Started", value: "start" },
    { name: "All Commands", value: "commands" },
    { name: "🎵 Music", value: "music" },
    { name: "🛡️ Moderation", value: "moderation" },
    { name: "📊 Progression", value: "progression" },
    { name: "🗳️ Polls", value: "polls" },
    { name: "👥 Community", value: "community" },
    { name: "🤖 AI", value: "ai-commands" },
    { name: "🔧 Utility", value: "utility" },
    { name: "Buttons & Panels", value: "ui" },
    { name: "AI Usage & Privacy", value: "ai" },
    { name: "What's New", value: "news" },
  ));

export async function execute(i: ChatInputCommandInteraction) {
  const isPublic = i.options.getBoolean("public") === true;
  const section = i.options.getString("section") ?? "start";

  // Build guide state
  const caps = await probeCapabilities(i.client);

  // Live command list from Discord (guild scope preferred)
  let commands: { name: string; description: string }[] = [];
  try {
    if (i.inGuild() && i.guild) {
      const fetched = await i.guild.commands.fetch();
      commands = [...fetched.values()].map(c => ({ name: c.name, description: c.description || "—" }));
    } else if (i.client.application) {
      const fetched = await i.client.application.commands.fetch();
      commands = [...fetched.values()].map(c => ({ name: c.name, description: c.description || "—" }));
    }
  } catch {/* ignore */}

  const ui = listUiElements();

  // Categorized command data (from /help)
  const CATEGORIES = {
    music: {
      emoji: "🎵",
      title: "Music Commands",
      commands: [
        { name: "/music play <query>", description: "Play a song from YouTube, Spotify, or SoundCloud", example: "/music play never gonna give you up" },
        { name: "/music search <query>", description: "Search for tracks and choose which to play", example: "/music search bohemian rhapsody" },
        { name: "/music filter <preset>", description: "Apply audio filters (bass boost, nightcore, etc.)", example: "/music filter bassboost" },
        { name: "/music queue", description: "View the current queue", example: "/music queue" },
        { name: "/music nowplaying", description: "Show currently playing track", example: "/music nowplaying" },
        { name: "/play <query>", description: "Legacy quick play (forwards to /music play)", example: "/play imagine dragons" },
        { name: "/skip", description: "Skip the current track", example: "/skip" },
      ],
    },
    moderation: {
      emoji: "🛡️",
      title: "Moderation Commands",
      commands: [
        { name: "/clean <count>", description: "Bulk delete messages with filters", example: "/clean count:50 bots:true" },
        { name: "/clean (filters)", description: "Available filters: user, bots, pattern, older_than, pinned", example: "/clean count:25 pattern:spam" },
        { name: "/guardian", description: "Configure auto-moderation settings", example: "/guardian" },
        // legacy purge command removed
      ],
    },
    progression: {
      emoji: "📊",
      title: "Progression & Economy",
      commands: [
        { name: "/rank", description: "View your XP level and progress", example: "/rank" },
        { name: "/leaderboard", description: "View top ranked users", example: "/leaderboard" },
        { name: "/balance", description: "Check your Shards balance", example: "/balance" },
        { name: "/daily", description: "Claim your daily Shards reward", example: "/daily" },
        { name: "/weekly", description: "Claim your weekly Shards reward", example: "/weekly" },
      ],
    },
    polls: {
      emoji: "🗳️",
      title: "Polls & Voting",
      commands: [
        { name: "/poll create", description: "Create an interactive poll with themes and gamification", example: "/poll create" },
        { name: "/poll now", description: "Post a daily poll immediately (staff only)", example: "/poll now" },
        { name: "/poll mystats", description: "View your voting statistics and badges", example: "/poll mystats" },
        { name: "/poll leaderboard", description: "View top voters by points", example: "/poll leaderboard" },
        { name: "/poll template", description: "Manage poll templates", example: "/poll template list" },
        { name: "/poll stats", description: "Show poll engine status (staff only)", example: "/poll stats" },
      ],
    },
    community: {
      emoji: "👥",
      title: "Community Commands",
      commands: [
        { name: "/factions", description: "Join or manage server factions", example: "/factions" },
        { name: "/lfg", description: "Looking for group system", example: "/lfg" },
        { name: "/oc", description: "Showcase your original character", example: "/oc" },
        { name: "/loredrop", description: "Post a lore drop for the community", example: "/loredrop" },
      ],
    },
    "ai-commands": {
      emoji: "🤖",
      title: "AI Commands",
      commands: [
        { name: "/vi", description: "Interactive help and guide (this command!)", example: "/vi section:music" },
        { name: "/wake", description: "Wake up Vi's AI presence", example: "/wake" },
        { name: "/capabilities", description: "View Vi's AI capabilities", example: "/capabilities" },
      ],
    },
    utility: {
      emoji: "🔧",
      title: "Utility Commands",
      commands: [
        { name: "/status", description: "Check bot status and uptime", example: "/status" },
        { name: "/diag", description: "Run diagnostics (staff only)", example: "/diag" },
        { name: "/vibrain", description: "ViBrain status and diagnostics", example: "/vibrain status" },
        { name: "/weather <location>", description: "Get current weather for any location", example: "/weather Chicago, IL" },
      ],
    },
  };

  // Section builders
  const buildStart = () => {
    const e = new EmbedBuilder()
      .setTitle("🧭 Vi — Quick Start")
      .setDescription("Use the dropdown below to browse sections. This guide reflects the current build.")
      .addFields(
        { name: "How to talk to Vi", value:
          "- Mention her or start your message with **vi**.\n" +
          "- Attach images if you want her to read or describe them.\n" +
          "- Use slash commands for precise actions.\n", inline: false },
        { name: "Browse Commands by Category", value:
          "🎵 Music • 🛡️ Moderation • 📊 Progression • 🗳️ Polls\n" +
          "👥 Community • 🤖 AI • 🔧 Utility\n" +
          "*Select a category from the dropdown to see examples!*", inline: false },
        { name: "Highlights", value:
          "• Onboarding & Pings\n" +
          "• Applications & Moderation\n" +
          "• Progression (XP/levels, shops)\n" +
          "• Vision (OCR & image description)\n" +
          "• Music with filters & search\n" +
          "• Poll gamification with badges\n", inline: false },
        { name: "AI Usage (short)", value:
          (caps.visionEnabled ? "Vision: **on**" : "Vision: **off**") +
          " • " + (caps.aiProviderConfigured ? "AI provider: **configured**" : "AI provider: **missing**") +
          "\nSay `opt-out analysis` to disable attachment analysis for you.", inline: false }
      )
      .setTimestamp(new Date());
    return e;
  };

  const buildCommands = (page=0) => {
    const perPage = 10;
    const pages = chunk(commands.sort((a,b)=>a.name.localeCompare(b.name)), perPage);
    const pageData = pages[page] ?? [];
    const e = new EmbedBuilder()
      .setTitle("📖 All Commands")
      .setDescription("All registered slash commands. Use the dropdown to browse by category.")
      .addFields(
        ...pageData.map(c => ({
          name: `/${c.name}`,
          value: c.description?.length ? c.description : "—"
        }))
      )
      .setFooter({ text: `Page ${page+1}/${Math.max(1,pages.length)} • ${commands.length} total` })
      .setTimestamp(new Date());
    return { embed: e, pages: pages.length };
  };

  const buildCategory = (categoryKey: keyof typeof CATEGORIES) => {
    const category = CATEGORIES[categoryKey];
    if (!category) return { embed: new EmbedBuilder().setTitle("Unknown Category"), pages: 1 };
    
    const e = new EmbedBuilder()
      .setTitle(`${category.emoji} ${category.title}`)
      .setDescription(`**${category.commands.length}** command${category.commands.length !== 1 ? "s" : ""} in this category:`)
      .addFields(
        category.commands.map((cmd) => ({
          name: cmd.name,
          value: `${cmd.description}\n*Example:* \`${cmd.example}\``,
          inline: false,
        }))
      )
      .setFooter({ text: "Use the dropdown to switch categories" })
      .setTimestamp(new Date());
    return { embed: e, pages: 1 };
  };

  const buildUI = () => {
    const lines = ui.length
      ? ui.map(u => `**${u.title}** — ${u.type}\n• Area: ${u.area}${u.command ? `\n• Related: /${u.command}` : ""}${u.how ? `\n• How: ${u.how}` : ""}${u.notes ? `\n• Notes: ${u.notes}` : ""}`).join("\n\n")
      : "_No UI surfaces registered yet._";
    return new EmbedBuilder()
      .setTitle("🧩 Buttons, Panels & Dropdowns")
      .setDescription(lines)
      .setTimestamp(new Date());
  };

  const buildAI = () => {
    const e = new EmbedBuilder()
      .setTitle("🧠 AI Usage & Privacy")
      .addFields(
        { name: "What Vi can do with images", value:
          caps.visionEnabled
            ? "• Read text from images (OCR)\n• Describe images when asked or relevant\n• Blend image text into moderation context"
            : "Vision is disabled in this build.", inline: false },
        { name: "Opt-outs & Controls", value:
          "• Say `opt-out analysis` to stop analysis of your attachments\n" +
          "• Say `opt-in analysis` to re-enable\n" +
          "• Channel-level switches exist for staff", inline: false },
        { name: "Why she sometimes won’t respond", value:
          "• You didn’t address her and no trigger matched\n" +
          "• Permissions/visibility in this channel\n" +
          "• Moderation gates (content or user)", inline: false },
      )
      .setTimestamp(new Date());
    return e;
  };

  const buildNews = () => {
    // If you register capabilities (you do), summarize them.
    const diag = [
      "• Ping Selector — opt-in roles for events/drops",
      "• Oathbound Onboarding — auto-role + route to panels",
      "• Applications — review board + DM results",
      "• XP & Levels — auto role grants, leaderboards",
      "• OCR merge — text extraction from attachments",
      "• AutoMod pipeline — safer replies & actions",
    ].join("\n");
    return new EmbedBuilder()
      .setTitle("🗞️ What’s New")
      .setDescription("Recent features and improvements:")
      .addFields({ name: "Highlights", value: diag })
      .setTimestamp(new Date());
  };

  // initial content
  let page = 0;
  const render = (sec: string) => {
    if (sec === "commands") {
      const { embed, pages } = buildCommands(page);
      return { embed, pages };
    }
    if (sec === "music") return buildCategory("music");
    if (sec === "moderation") return buildCategory("moderation");
    if (sec === "progression") return buildCategory("progression");
    if (sec === "polls") return buildCategory("polls");
    if (sec === "community") return buildCategory("community");
    if (sec === "ai-commands") return buildCategory("ai-commands");
    if (sec === "utility") return buildCategory("utility");
    if (sec === "ui") return { embed: buildUI(), pages: 1 };
    if (sec === "ai") return { embed: buildAI(), pages: 1 };
    if (sec === "news") return { embed: buildNews(), pages: 1 };
    return { embed: buildStart(), pages: 1 };
  };

  const sections = [
    { label: "Getting Started", value: "start" },
    { label: "All Commands", value: "commands" },
    { label: "🎵 Music", value: "music" },
    { label: "🛡️ Moderation", value: "moderation" },
    { label: "📊 Progression", value: "progression" },
    { label: "🗳️ Polls", value: "polls" },
    { label: "👥 Community", value: "community" },
    { label: "🤖 AI", value: "ai-commands" },
    { label: "🔧 Utility", value: "utility" },
    { label: "Buttons & Panels", value: "ui" },
    { label: "AI Usage & Privacy", value: "ai" },
    { label: "What's New", value: "news" },
  ];

  const dropdown = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("vi:guide:section")
      .setPlaceholder("Choose a section")
      .addOptions(sections.map(s => new StringSelectMenuOptionBuilder().setLabel(s.label).setValue(s.value)))
  );

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("vi:guide:prev").setLabel("Prev").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("vi:guide:next").setLabel("Next").setStyle(ButtonStyle.Secondary)
  );

  const first = render(section);
  await i.reply({ embeds: [first.embed], components: [dropdown, nav], ephemeral: !isPublic });

  const msg = await i.fetchReply();
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 5 * 60_000 });
  const selectCollector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 5 * 60_000 });

  let currentSection = section;
  let totalPages = first.pages;

  const pushUpdate = async () => {
    const r = render(currentSection);
    totalPages = r.pages;
    await i.editReply({ embeds: [r.embed], components: [dropdown, nav] }).catch(() => {});
  };

  collector.on("collect", async (it) => {
    if (it.user.id !== i.user.id) return it.reply({ content: "Use your own /vi to navigate.", flags: MessageFlags.Ephemeral });
    if (it.customId.endsWith(":prev")) page = Math.max(0, page - 1);
    if (it.customId.endsWith(":next")) page = Math.min(totalPages - 1, page + 1);
    await it.deferUpdate();
    await pushUpdate();
  });

  selectCollector.on("collect", async (it) => {
    if (it.user.id !== i.user.id) return it.reply({ content: "Use your own /vi to navigate.", flags: MessageFlags.Ephemeral });
    currentSection = it.values[0];
    page = 0;
    await it.deferUpdate();
    await pushUpdate();
  });
}

// Optional: markdown export for decrees
export const exportData = new SlashCommandBuilder()
  .setName("vi-export")
  .setDescription("Export a Markdown guide for decrees.")
  .setDefaultMemberPermissions(P.ManageGuild);

export async function export_execute(i: ChatInputCommandInteraction) {
  const caps = await probeCapabilities(i.client);
  const ui = listUiElements();

  let commands: { name: string; description: string }[] = [];
  try {
    if (i.inGuild() && i.guild) {
      const fetched = await i.guild.commands.fetch();
      commands = [...fetched.values()].map(c => ({ name: c.name, description: c.description || "—" }))
        .sort((a,b)=>a.name.localeCompare(b.name));
    }
  } catch {}

  const md =
`# Vi — Member Guide

## Getting Started
- Mention **vi** or use slash commands.
- Attach images if you want help with them.
- If she’s quiet, it’s likely permissions, addressing, or moderation gates.

## AI Usage & Privacy
- Vision: **${caps.visionEnabled ? "on" : "off"}** • AI provider: **${caps.aiProviderConfigured ? "configured" : "missing"}**
- Opt-out: say \`opt-out analysis\`. Opt-in: \`opt-in analysis\`.

## Commands
${commands.map(c => `- \`/${c.name}\` — ${c.description || "—"}`).join("\n") || "_No commands discovered._"}

## Buttons, Panels & Dropdowns
${ui.length ? ui.map(u => `- **${u.title}** (${u.type}) — ${u.area}${u.command ? ` — related: \`/${u.command}\`` : ""}${u.how ? ` — ${u.how}` : ""}${u.notes ? ` — ${u.notes}` : ""}`).join("\n") : "_No UI elements registered._"}

`;

  await i.reply({ files: [{ attachment: Buffer.from(md, "utf8"), name: "vi_guide.md" }], flags: MessageFlags.Ephemeral });
}
