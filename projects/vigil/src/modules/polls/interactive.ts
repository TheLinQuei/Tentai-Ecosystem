// Constants
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  
  ModalBuilder,
  PermissionFlagsBits as P,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  TextChannel,
  Guild,
  
} from "discord.js";
import type { Message, TextBasedChannel, Role } from 'discord.js';
import {
  registerLive,
  getLive,
  setCollectorEnded,
  countWeighted,
  toggleVoteWeighted,
} from "./runtime";
import type { BuiltPoll } from "./storage";
// import { z } from "zod";

// Constants
const POLL_CHANNEL_ID_DEFAULT = "1414128616958333018";
const TIMEOUT_THEME_SELECT = 60_000;
const TIMEOUT_QUESTION_MODAL = 120_000;
// const TIMEOUT_ANSWER_BUTTON = 120_000;
const TIMEOUT_ANSWER_MODAL = 180_000;
const TIMEOUT_SETTINGS_COLLECTOR = 120_000;
// const TIMEOUT_ROLE_GATE = 60_000;
// const TIMEOUT_PUBLISH_BUTTON = 120_000;
// const EMOJI_PICKER_ROW_SIZE = 5;
// const EMOJI_PICKER_TIMEOUT = 120_000;

// Theme-based visual styling
const THEME_STYLES = {
  wyr: { color: 0x9B59B6, emoji: "🤔", title: "Would You Rather" },
  omg: { color: 0xE74C3C, emoji: "🗑️", title: "ONE MUST GO" },
  vibe: { color: 0x3498DB, emoji: "🧭", title: "Vibe Check" },
  yesno: { color: 0x2ECC71, emoji: "✅", title: "Yes or No" },
  multi: { color: 0xF39C12, emoji: "🔢", title: "Multiple Choice" },
  rating5: { color: 0xFFD700, emoji: "⭐", title: "Rating" },
  custom: { color: 0x95A5A6, emoji: "💬", title: "Poll" },
};

// Utility helpers
function fmtDuration(ms: number): string {
  if (!ms || isNaN(ms)) return "?";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
function relTimeFromNow(ms: number) {
  return fmtDuration(ms);
}
function bar(pct: number) {
  // More visually appealing progress bar with gradients
  const filled = Math.round(pct / 5);
  const bars = ["▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰", "▰"];
  const result = bars.map((_, i) => i < filled ? "▰" : "▱").join("");
  return result;
}
function parseCsvLike(str: string, max: number) {
  return str
    .split(/,|\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}
async function fetchPollsChannel(i: ChatInputCommandInteraction): Promise<TextChannel | null> {
  const id = process.env.POLLS_CHANNEL_ID || POLL_CHANNEL_ID_DEFAULT;
  try {
    const ch = id ? await i.client.channels.fetch(id) : null;
    return ch && ch.type === ChannelType.GuildText ? (ch) : null;
  } catch (err) {
    console.error("[poll] fetchPollsChannel error", err);
    return null;
  }
}
async function awaitUserMessage(channel: TextBasedChannel, userId: string, timeout: number): Promise<Message | null> {
  return new Promise<Message | null>((resolve) => {
    try {
      const collector = (channel as any).createMessageCollector({
        filter: (m: Message) => m.author.id === userId,
        max: 1,
        time: timeout,
      });
      collector.on("end", (collected: any) => {
        resolve(collected.first() ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}
async function resolveRoleMentionOrName(msg: { mentions?: { roles?: { first: () => Role | null } }, content: string }, guild: Guild): Promise<Role | null> {
  const mention = msg.mentions?.roles?.first();
  if (mention) return mention;
  const text = msg.content.trim();
  const idMatch = text.match(/^<@&?(\d+)>$/) || text.match(/^(\d{17,20})$/);
  if (idMatch) return guild.roles.cache.get(idMatch[1]) ?? null;
  return guild.roles.cache.find((r) => r.name.toLowerCase() === text.toLowerCase()) ?? null;
}
function log(stage: string, ...args: any[]) {
  console.log(`[poll] ${new Date().toISOString()} :: ${stage}`, ...args);
}

export async function startInteractivePollWizard(i: ChatInputCommandInteraction) {
  try {
    if (i.replied || i.deferred) return log("already replied/deferred – abort");
    log("wizard start", i.user.tag, i.id);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    log("deferred initial reply");
    const channel = await fetchPollsChannel(i);
    if (!channel) {
      log("polls channel not found");
      await i.editReply({ content: "❌ Polls channel not found." });
      return;
    }
    // STEP 1 — Theme select
    const select = new StringSelectMenuBuilder()
      .setCustomId("poll_type")
      .setPlaceholder("Choose a poll type / theme")
      .addOptions(
        { label: "Would You Rather", value: "wyr", emoji: "🤔" },
        { label: "One Must Go", value: "omg", emoji: "🗑️" },
        { label: "Vibe Check", value: "vibe", emoji: "🧭" },
        { label: "Yes / No", value: "yesno", emoji: "✅" },
        { label: "Multiple Choice", value: "multi", emoji: "🔢" },
        { label: "Rating 1–5", value: "rating5", emoji: "⭐" },
        { label: "Custom", value: "custom", emoji: "💬" },
      );
    await i.editReply({
      content: "Let’s build your poll — choose a theme:",
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    });
    log("sent theme select");
    const themeSelect = (await i.fetchReply()
      .then((m: any) =>
        m.awaitMessageComponent({
          componentType: ComponentType.StringSelect,
          time: TIMEOUT_THEME_SELECT,
          filter: (c: StringSelectMenuInteraction) => c.user.id === i.user.id,
        }),
      )
      .catch((err: unknown) => { console.error("[poll] themeSelect error", err); return null; })) as StringSelectMenuInteraction | null;
    if (!themeSelect) return log("theme select timed out"), await i.editReply({ content: "⏱ Timeout." });
    const theme = themeSelect.values[0];
    log("theme chosen", theme);
    // STEP 2 — Question modal
    const placeholders: Record<string, string> = {
      yesno: "Do you prefer night or day?",
      rating5: "Rate today's vibes (1–5)",
      wyr: "Would you rather ...?",
      omg: "ONE MUST GO: ...",
      vibe: "Describe your vibe in one word!",
      custom: "What's your question?",
    };
    const modalQ = new ModalBuilder().setCustomId("poll_modal_q").setTitle("Poll Question");
    modalQ.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("q")
          .setLabel("Your Question")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder(placeholders[theme] || "What's your question?"),
      ),
    );
    log("showing modalQ");
    await themeSelect.showModal(modalQ);
    const qSubmit = await themeSelect
      .awaitModalSubmit({
        time: TIMEOUT_QUESTION_MODAL,
        filter: (m) => m.user.id === i.user.id,
      })
      .catch((err: unknown) => { console.error("[poll] qSubmit error", err); return null; });
    if (!qSubmit) return log("question modal timeout"), await i.editReply({ content: "⏱ Timeout." });
    const question = qSubmit.fields.getTextInputValue("q").trim();
    log("question captured", question);
    
    // STEP 3 — Answer choice using reply instead of another modal
    const suggestions =
      theme === "yesno"
        ? ["Yes", "No"]
        : theme === "rating5"
        ? ["1", "2", "3", "4", "5"]
        : ["Option A", "Option B", "Option C"];

    // Reply to the modal submit with answer collection request
    await qSubmit.reply({
      content: `**Question:** ${question}\n\nNow provide your answers and emojis:\n\n**Answers** (comma or newline separated):\n\`${suggestions.join(", ")}\`\n\n**Emojis** (optional, comma separated):\n\`e.g. 🔥,💧,🌪️\`\n\nReply with your answers first, then optionally emojis on the next line.`,
      flags: MessageFlags.Ephemeral
    });
    
    log("waiting for answer message");
    
    // Wait for user's message with answers
    const answerMsg = i.channel ? await awaitUserMessage(i.channel, i.user.id, TIMEOUT_ANSWER_MODAL) : null;
    if (!answerMsg) {
      log("answers message timeout");
      await qSubmit.followUp({ content: "⏱ Timeout waiting for answers.", flags: MessageFlags.Ephemeral });
      return;
    }
    
    const answerContent = answerMsg.content || "";
    log("answers message received", answerContent);
    
    // Parse the message content - first line is answers, second line (if exists) is emojis
    const lines = answerContent.split('\n').map(line => line.trim()).filter(Boolean);
    const answersText = lines[0] || "";
    const emojisText = lines[1] || "";
    
    const labels = parseCsvLike(answersText, 10);
    const emos = parseCsvLike(emojisText, labels.length);
    const answers: { label: string, emoji?: string }[] = labels.map((l, idx) => ({ 
      label: l, 
      emoji: emos[idx] || undefined 
    }));
    
    if (answers.length < 2) {
      await qSubmit.followUp({ content: "❌ Need at least two answers to create a poll.", flags: MessageFlags.Ephemeral });
      return;
    }
    
    log("answers parsed", answers);

    // STEP 4 — Settings + duration
    const settingsMenu = new StringSelectMenuBuilder()
      .setCustomId("poll_settings")
      .setPlaceholder("Settings (select multiple)")
      .setMinValues(1)
      .setMaxValues(6)
      .addOptions(
        { label: "Anonymous votes", value: "anon", emoji: "🙈" },
        { label: "Allow multiple", value: "multi", emoji: "🧮" },
        { label: "Create thread", value: "thread", emoji: "🧵" },
        { label: "Show live results", value: "live", emoji: "📈" },
        { label: "Role-gate voting", value: "rolegate", emoji: "🔒" },
        { label: "DM me results", value: "dm", emoji: "📬" },
      );
    const durationMenu = new StringSelectMenuBuilder()
      .setCustomId("poll_duration")
      .setPlaceholder("Duration")
      .addOptions(
        { label: "15 min", value: "900000" },
        { label: "1 hour", value: "3600000" },
        { label: "6 hours", value: "21600000" },
        { label: "24 hours", value: "86400000" },
      );
    const msg4 = await qSubmit.followUp({
      content: "Choose settings and duration:",
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(settingsMenu),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(durationMenu),
      ],
      flags: MessageFlags.Ephemeral,
    });

    let settings: StringSelectMenuInteraction | null = null;
    let duration: StringSelectMenuInteraction | null = null;
    const collector = msg4.createMessageComponentCollector({
      time: TIMEOUT_SETTINGS_COLLECTOR,
      componentType: ComponentType.StringSelect,
      filter: (c: any) => c.user.id === i.user.id,
    });
    await new Promise<void>((res) => {
      collector.on("collect", async (c: any) => {
        if (c.customId === "poll_settings") settings = c;
        if (c.customId === "poll_duration") duration = c;
        await c.deferUpdate();
        if (settings && duration) collector.stop("done");
      });
      collector.on("end", () => res());
    });
    if (!settings || !duration) {
      await qSubmit.editReply({ content: "⏱ Timed out.", components: [] });
      return;
    }
    const s = settings as StringSelectMenuInteraction;
    const d = duration as StringSelectMenuInteraction;

    /* Build poll object */
  const vals = new Set(s.values);
    
    // Get theme styling
    const themeStyle = THEME_STYLES[theme as keyof typeof THEME_STYLES] || THEME_STYLES.custom;
    
    const built: BuiltPoll = {
      question,
      answers,
      anonymous: vals.has("anon"),
      multi: vals.has("multi"),
      makeThread: vals.has("thread"),
      live: vals.has("live"),
  durationMs: Number(d.values[0] || 3600000),
      dmCreator: vals.has("dm"),
      theme: theme as any,
      color: themeStyle.color,
    };

    if (vals.has("rolegate")) {
      await qSubmit.editReply({ content: "Mention the role to gate voting (60 s):", components: [] });
      const one = i.channel ? await awaitUserMessage(i.channel, i.user.id, 60_000) : null;
      const role = one ? await resolveRoleMentionOrName(one as any, i.guild!) : null;
      if (role) built.roleGateId = role.id;
    }

    /* Preview & publish */
    const preview = new EmbedBuilder()
      .setTitle(`${themeStyle.emoji} ${themeStyle.title}`)
      .setColor(themeStyle.color)
      .setDescription(
        `**${built.question}**\n\n${built.answers
          .map((a) => `• ${a.emoji ? `${a.emoji} ` : ""}${a.label}`)
          .join("\n")}`,
      )
      .setFooter({
        text: `Anon:${built.anonymous ? "Yes" : "No"} • Multi:${built.multi ? "Yes" : "No"} • Duration:${fmtDuration(
          built.durationMs,
        )}`,
      });
    const rowPub = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("poll_pub").setLabel("Publish").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("poll_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary),
    );
  const prevMsg = await qSubmit.editReply({ content: "Preview your poll:", embeds: [preview], components: [rowPub] });
    const pubClick = (await prevMsg
      .awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 120_000,
        filter: (b: ButtonInteraction) => b.user.id === i.user.id,
      })
      .catch(() => null));
    if (!pubClick) {
      await qSubmit.editReply({ content: "⏱ Timed out.", components: [] });
      return;
    }
    if (pubClick.customId === "poll_cancel") {
      await pubClick.update({ content: "❎ Cancelled.", embeds: [], components: [] });
      return;
    }
    await pubClick.deferUpdate();

    /* Post poll */
    const me = await channel.guild.members.fetchMe();
    const perms = channel.permissionsFor(me);
    const needed = [P.ViewChannel, P.SendMessages, P.EmbedLinks];
    if (!perms || !needed.every((p) => perms.has(p))) {
      await pubClick.followUp({ content: "❌ Missing permissions to post in poll channel.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Split answer buttons into multiple rows (max 5 per row)
    const voteRows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < built.answers.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      built.answers.slice(i, i + 5).forEach((a, idx) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`vote_${i + idx}`)
            .setLabel(a.emoji ? `${a.emoji} ${a.label}` : a.label)
            .setStyle(ButtonStyle.Primary),
        );
      });
      voteRows.push(row);
    }
    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("poll_close").setLabel("Close Poll").setStyle(ButtonStyle.Danger),
    );
    const liveEmbed = new EmbedBuilder(preview.data).setFooter({
      text: `Anon:${built.anonymous ? "Yes" : "No"} • Ends ${relTimeFromNow(built.durationMs)}`,
    });
    const posted = await channel.send({ embeds: [liveEmbed], components: [...voteRows, closeRow] });
    let thread: any = null;
    if (built.makeThread) {
      try {
        thread = await posted.startThread({ name: `🧵 ${built.question.slice(0, 90)}` });
      } catch {}
    }

    registerLive(posted, built, i.user.id, built.durationMs);
    const endAt = Date.now() + built.durationMs;

    // Real-time countdown updater
    let countdownInterval: NodeJS.Timeout | null = null;
    if (built.live) {
      countdownInterval = setInterval(async () => {
        const now = Date.now();
        const msLeft = endAt - now;
        if (msLeft <= 0) return;
        const live = getLive(posted.id);
        if (!live) return;
        const counts = countWeighted(built, live as any);
        const total = counts.reduce((a, c) => a + c, 0) || 1;
        const lines = built.answers
          .map((a, i2) => {
            const pct = Math.round((counts[i2] / total) * 100);
            const tag = a.emoji ? `${a.emoji} ${a.label}` : a.label;
            return `**${tag}** — ${pct}%\n${bar(pct)}`;
          })
          .join("\n");
        const updated = new EmbedBuilder(liveEmbed.data)
          .setDescription(`**${built.question}**\n\n${lines}`)
          .setFooter({
            text: `Anon:${built.anonymous ? "Yes" : "No"} • Ends ${relTimeFromNow(msLeft)}`,
          });
        await posted.edit({ embeds: [updated] }).catch(() => null);
      }, 10000); // update every 10s
    }

    const collector2 = posted.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: built.durationMs + 5000,
      filter: (b) => b.message.id === posted.id,
    });

    collector2.on("collect", async (b) => {
      if (b.customId === "poll_close") {
        if (b.user.id === i.user.id || (b.member).permissions.has(P.ManageGuild)) {
          collector2.stop("closed");
          await b.deferUpdate();
        } else {
          await b.reply({ content: "Only the creator or staff can close this.", flags: MessageFlags.Ephemeral });
        }
        return;
      }

      if (!b.customId.startsWith("vote_")) return;
      if (built.roleGateId && !(b.member).roles.cache.has(built.roleGateId)) {
        await b.reply({ content: "You lack the required role to vote.", flags: MessageFlags.Ephemeral });
        return;
      }

      const idx = Number(b.customId.split("_")[1]);
      await toggleVoteWeighted({
        messageId: posted.id,
        userId: b.user.id,
        member: b.member,
        answerIndex: idx,
        multi: built.multi,
      });
      
      // Track gamification stats
      try {
        const { recordVote, buildBadgeAnnouncement } = await import("./gamification.js");
        const result = await recordVote(i.guild!.id, b.user.id);
        
        // Notify user of progress (ephemeral if new badges)
        if (result.newBadges.length > 0) {
          const announcement = buildBadgeAnnouncement(result.newBadges);
          await b.reply({
            content: `Vote recorded! +${result.pointsGained} points${announcement}`,
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await b.deferUpdate();
        }
      } catch (err) {
        // Gamification failed, but vote still counted
        console.error("[poll] gamification error:", err);
        await b.deferUpdate();
      }

      if (built.live) {
        const live = getLive(posted.id);
        if (!live) return;
        const counts = countWeighted(built, live as any);
        const total = counts.reduce((a, c) => a + c, 0) || 1;
        const lines = built.answers
          .map((a, i2) => {
            const pct = Math.round((counts[i2] / total) * 100);
            const tag = a.emoji ? `${a.emoji} ${a.label}` : a.label;
            return `**${tag}** — ${pct}%\n${bar(pct)}`;
          })
          .join("\n");
        const updated = new EmbedBuilder(liveEmbed.data)
          .setDescription(`**${built.question}**\n\n${lines}`)
          .setFooter({
            text: `Anon:${built.anonymous ? "Yes" : "No"} • Ends ${relTimeFromNow(endAt - Date.now())}`,
          });
        await posted.edit({ embeds: [updated] }).catch(() => null);
      }
    });

    collector2.on("end", async () => {
      if (countdownInterval) clearInterval(countdownInterval);
      // Disable all vote buttons in all rows
      const disabledVoteRows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < built.answers.length; i += 5) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        built.answers.slice(i, i + 5).forEach((a, idx) => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`vote_${i + idx}`)
              .setLabel(a.emoji ? `${a.emoji} ${a.label}` : a.label)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );
        });
        disabledVoteRows.push(row);
      }
      const disabledClose = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("poll_close").setLabel("Closed").setStyle(ButtonStyle.Secondary).setDisabled(true),
      );
      await posted.edit({ components: [...disabledVoteRows, disabledClose] }).catch(() => null);
      setCollectorEnded(posted.id);
      // Optionally, post a message in the thread when poll closes
      if (thread) {
        try {
          await thread.send({ content: `Poll closed!` });
        } catch {}
      }
    });

    await pubClick.followUp({ content: `✅ Published in ${channel}.`, flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error("[poll] fatal", err);
    if (!i.replied && !i.deferred) {
      await i.reply({ content: "⚠️ Internal poll error.", flags: MessageFlags.Ephemeral }).catch(() => null);
    } else {
      await i.editReply({ content: "⚠️ Internal poll error." }).catch(() => null);
    }
  }
}
