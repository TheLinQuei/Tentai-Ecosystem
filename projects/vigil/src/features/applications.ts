// src/features/applications.ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GuildMember,
  ModalBuilder,
  PermissionFlagsBits as P,
  Role,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  ThreadAutoArchiveDuration,
  MessageFlags
} from "discord.js";

// --- channels & staff config ---
const REVIEW_CHANNEL_ID = process.env.APP_REVIEW_CHANNEL_ID ?? "1413799066688819201";
const ARCHIVE_CHANNEL_ID = process.env.APP_ARCHIVE_CHANNEL_ID ?? "";
const STATUS_CHANNEL_ID = process.env.APP_STATUS_CHANNEL_ID ?? "";
const PANEL_CHANNEL_ID = process.env.APP_PANEL_CHANNEL_ID ?? ""; // optional: for refreshing the pinned board
const STAFF_CSV = process.env.STAFF_CSV || "Sovereign,The House,Starlit Orders,Sentinels";
const OWNER_ID = process.env.BOT_OWNER_ID ?? process.env.FORSA_ID;

// --- app catalog ---
type AppKey = keyof typeof APPS;

const APPS = {
  admin: {
    label: "Admin",
    emoji: "🛡️",
    roleName: "The House",
    desc: "High-trust leadership. Policy, safety, direction.",
    questions: [
      { id: "exp", label: "Admin/lead experience (servers, size, duties)?", style: TextInputStyle.Paragraph, required: true },
      { id: "risk", label: "Biggest moderation crisis you’ve handled?", style: TextInputStyle.Paragraph, required: true },
      { id: "time", label: "Weekly availability (days & hours, timezone)", style: TextInputStyle.Short, required: true },
      { id: "values", label: "Your admin philosophy in 1–2 lines", style: TextInputStyle.Short, required: true },
      { id: "conflict", label: "How do you handle staff conflict?", style: TextInputStyle.Paragraph, required: true },
    ],
  },
  moderator: {
    label: "Moderator",
    emoji: "⚔️",
    roleName: "Starlit Orders",
    desc: "Frontline community safety & vibe.",
    questions: [
      { id: "exp", label: "Mod experience (tools used, examples)?", style: TextInputStyle.Paragraph, required: true },
      { id: "situ", label: "How do you act on harassment reports?", style: TextInputStyle.Paragraph, required: true },
      { id: "time", label: "Weekly availability (days/hours, TZ)", style: TextInputStyle.Short, required: true },
      { id: "edge", label: "Timeout vs ban: where’s your line?", style: TextInputStyle.Paragraph, required: true },
      { id: "why", label: "Why this server?", style: TextInputStyle.Short, required: true },
    ],
  },
  jrmod: {
    label: "Junior Mod",
    emoji: "🧭",
    roleName: "Sentinels",
    desc: "Learn the tools. Shadow seniors. Handle basics.",
    questions: [
      { id: "exp", label: "Any prior mod/helper experience?", style: TextInputStyle.Paragraph, required: true },
      { id: "tone", label: "Your moderation tone in one line", style: TextInputStyle.Short, required: true },
      { id: "scen", label: "User spams slurs—your first 3 actions?", style: TextInputStyle.Paragraph, required: true },
      { id: "time", label: "Weekly availability (days/hours, TZ)", style: TextInputStyle.Short, required: true },
      { id: "goal", label: "What do you want to learn on the job?", style: TextInputStyle.Short, required: true },
    ],
  },
  eventhost: {
    label: "Event Host",
    emoji: "🎉",
    roleName: "Bards",
    desc: "Plan & run events. Keep it smooth.",
    questions: [
      { id: "exp", label: "Events you’ve run? Outcome?", style: TextInputStyle.Paragraph, required: true },
      { id: "pitch", label: "Pitch an event (1–2 lines)", style: TextInputStyle.Short, required: true },
      { id: "plan", label: "Prep tasks beforehand?", style: TextInputStyle.Paragraph, required: true },
      { id: "risk", label: "What can go wrong & mitigation?", style: TextInputStyle.Paragraph, required: true },
      { id: "time", label: "Availability (days/hours, TZ)", style: TextInputStyle.Short, required: true },
    ],
  },
  lorecurator: {
    label: "Lore Curator",
    emoji: "📜",
    roleName: "Bards",
    desc: "Curate & format Codex entries with consistency.",
    questions: [
      { id: "exp", label: "Worldbuilding/editing experience?", style: TextInputStyle.Paragraph, required: true },
      { id: "sample", label: "Link a sample (or N/A)", style: TextInputStyle.Short, required: true },
      { id: "style", label: "How do you enforce style/consistency?", style: TextInputStyle.Paragraph, required: true },
      { id: "tools", label: "Tools (Notion, Docs, etc.)", style: TextInputStyle.Short, required: true },
      { id: "time", label: "Availability (days/hours, TZ)", style: TextInputStyle.Short, required: true },
    ],
  },
  community: {
    label: "Community Support",
    emoji: "🤝",
    roleName: "Odysseans",
    desc: "Greeter. Ticket triage. Light moderation.",
    questions: [
      { id: "exp", label: "Support/mod/helpdesk experience?", style: TextInputStyle.Paragraph, required: true },
      { id: "conflict", label: "How do you de-escalate?", style: TextInputStyle.Paragraph, required: true },
      { id: "tools", label: "Tools you know (AutoMod/Tickets)", style: TextInputStyle.Short, required: true },
      { id: "time", label: "Availability (days/hours, TZ)", style: TextInputStyle.Short, required: true },
      { id: "why", label: "Why this role?", style: TextInputStyle.Short, required: true },
    ],
  },
  developer: {
    label: "Developer",
    emoji: "💻",
    roleName: "Artificer",
    desc: "Bot/site/features. Ship clean code.",
    questions: [
      { id: "stack", label: "Primary stack (Node/TS/etc.)", style: TextInputStyle.Short, required: true },
      { id: "repo", label: "Repo/portfolio (or N/A)", style: TextInputStyle.Short, required: true },
      { id: "exp", label: "What have you shipped lately?", style: TextInputStyle.Paragraph, required: true },
      { id: "fit", label: "Where can you help first?", style: TextInputStyle.Paragraph, required: true },
      { id: "time", label: "Availability (days/hours, TZ)", style: TextInputStyle.Short, required: true },
    ],
  },
  designer: {
    label: "Designer",
    emoji: "🎨",
    roleName: "Bards",
    desc: "Brand/UI/graphics. Consistent visuals.",
    questions: [
      { id: "port", label: "Portfolio link (or N/A)", style: TextInputStyle.Short, required: true },
      { id: "tools", label: "Tools (Figma/PS/etc.)", style: TextInputStyle.Short, required: true },
      { id: "exp", label: "Recent design you’re proud of?", style: TextInputStyle.Paragraph, required: true },
      { id: "fit", label: "What would you design first?", style: TextInputStyle.Paragraph, required: true },
      { id: "time", label: "Availability (days/hours, TZ)", style: TextInputStyle.Short, required: true },
    ],
  },
} as const;

// --- capacity (env overrides) ---
const CAPACITY: Partial<Record<AppKey, number>> = {
  admin: Number(process.env.APP_CAP_ADMIN ?? 2),
  moderator: Number(process.env.APP_CAP_MODERATOR ?? 5),
  jrmod: Number(process.env.APP_CAP_JRMOD ?? 6),
  eventhost: Number(process.env.APP_CAP_EVENTHOST ?? 3),
  lorecurator: Number(process.env.APP_CAP_LORE ?? 3),
  community: Number(process.env.APP_CAP_COMMUNITY ?? 6),
  developer: Number(process.env.APP_CAP_DEVELOPER ?? 2),
  designer: Number(process.env.APP_CAP_DESIGNER ?? 2),
};

// --- tiny helpers ---
function norm(s: string) {
  return s
    .normalize("NFKC")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F]/gu, "")
    .replace(/[^\p{L}\p{N}\- _]/gu, "")
    .replace(/[·・]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function resolveTextChannelByIdOrName(client: Client, guildId: string, hint: string): Promise<TextChannel> {
  const guild = await client.guilds.fetch(guildId).then((g) => g.fetch());
  const byId = await guild.channels.fetch(hint).catch(() => null);
  if (byId && byId.type === ChannelType.GuildText) return byId;

  const target = norm(hint);
  const all = await guild.channels.fetch();
  let best: { ch: TextChannel; score: number } | null = null;

  for (const ch of all.values()) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;
    const n = norm((ch).name);
    let score = 0;
    if (n === target) score = 3;
    else if (n.endsWith(target)) score = 2;
    else if (n.includes(target)) score = 1;
    if (!best || score > best.score) best = { ch: ch, score };
  }
  if (best) return best.ch;

  throw new Error(`Channel "${hint}" not found as text channel.`);
}

function needPerms(channel: TextChannel, me: GuildMember) {
  const perms = channel.permissionsFor(me);
  const req = [P.ViewChannel, P.SendMessages, P.EmbedLinks];
  const missing = req.filter((p) => !perms?.has(p));
  return { ok: missing.length === 0, missing };
}

// capacity helpers
function roleNameFor(appKey: AppKey) {
  return APPS[appKey].roleName;
}
function currentFilled(guild: any, appKey: AppKey): number {
  const rn = roleNameFor(appKey);
  if (!rn) return 0;
  const role = guild.roles.cache.find((r: any) => r.name === rn);
  return role ? role.members.size : 0;
}
function spotsLeft(guild: any, appKey: AppKey): number | null {
  const cap = CAPACITY[appKey];
  if (!cap || cap <= 0) return null;
  return Math.max(0, cap - currentFilled(guild, appKey));
}
function isFull(guild: any, appKey: AppKey): boolean {
  const left = spotsLeft(guild, appKey);
  return left !== null && left <= 0;
}

// --- UI builders ---
function appRow(keys: AppKey[], guild?: any) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  keys.forEach((k) => {
    const a = APPS[k];
    const disabled = guild ? isFull(guild, k) : false;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`apply:${k}`)
        .setLabel(`${a.emoji} ${a.label}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
    );
  });
  return row;
}

function buildBoardEmbed(guild: any) {
  const e = new EmbedBuilder()
    .setTitle("Applications")
    .setDescription("Pick a role to apply. Fill the form. Staff will review in DMs.")
    .setColor(0x111111);
  (Object.keys(APPS) as AppKey[]).forEach((k) => {
    const a = APPS[k];
    const cap = CAPACITY[k];
    const left = spotsLeft(guild, k);
    const suffix = cap ? `\n**Spots:** ${Math.max(0, left ?? cap)}/${cap} left` : "";
    e.addFields({ name: `${a.emoji} ${a.label}`, value: `${a.desc}${suffix}`, inline: true });
  });
  return e;
}

function buildModal(key: AppKey, userId: string) {
  const a = APPS[key];
  const m = new ModalBuilder().setCustomId(`modal:${key}:${userId}`).setTitle(`${a.emoji} ${a.label} Application`);
  const rows: ActionRowBuilder<TextInputBuilder>[] = [];
  a.questions.slice(0, 5).forEach((q) => {
    rows.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(q.id)
          .setLabel(q.label.slice(0, 45))
          .setRequired(q.required)
          .setStyle(q.style)
          .setMaxLength(q.style === TextInputStyle.Short ? 256 : 1024),
      ),
    );
  });
  m.addComponents(...rows);
  return m;
}

function buildSubmissionEmbed(key: AppKey, applicant: GuildMember, answers: Record<string, string>) {
  const a = APPS[key];
  const e = new EmbedBuilder()
    .setTitle(`${a.emoji} ${a.label} — New Application`)
    .setDescription(a.desc)
    .setColor(0x222222)
    .addFields({ name: "Applicant", value: `${applicant} • \`${applicant.user.tag}\` • ${applicant.id}` })
    .setTimestamp(new Date());
  a.questions.forEach((q) =>
    e.addFields({ name: q.label, value: (answers[q.id] ?? "—").slice(0, 1024) || "—" }),
  );
  return e;
}

function reviewButtons(key: AppKey, applicantId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`review:mark:${key}:${applicantId}`).setLabel("Mark Reviewed").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`review:approve:${key}:${applicantId}`).setLabel("Approve").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`review:reject:${key}:${applicantId}`).setLabel("Reject").setStyle(ButtonStyle.Danger),
  );
}

async function grantRoleIfExists(member: GuildMember, roleName?: string) {
  if (!roleName) return false;
  const role = member.guild.roles.cache.find((r) => r.name === roleName);
  if (!role) return false;
  if (member.roles.cache.has(role.id)) return true;
  await member.roles.add(role, "Application approved");
  return true;
}

// disable the clicked button on the message
function disableButtonOnMessage(message: any, customId: string) {
  if (!message?.components?.length) return null;
  const newRows = message.components.map((row: any) => {
    const newButtons = row.components.map((c: any) => {
      const b = ButtonBuilder.from(c);
      if (c.customId === customId) b.setDisabled(true);
      return b;
    });
    return new ActionRowBuilder<ButtonBuilder>().addComponents(newButtons);
  });
  return { components: newRows };
}

// --- status/archive helpers ---
async function getStatusChannel(guild: any): Promise<TextChannel | null> {
  if (!STATUS_CHANNEL_ID) return null;
  const ch = await guild.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  return ch && ch.type === ChannelType.GuildText ? (ch as TextChannel) : null;
}

async function getArchiveChannel(guild: any): Promise<TextChannel | null> {
  if (!ARCHIVE_CHANNEL_ID) return null;
  const ch = await guild.channels.fetch(ARCHIVE_CHANNEL_ID).catch(() => null);
  return ch && ch.type === ChannelType.GuildText ? (ch as TextChannel) : null;
}

async function getOrCreateStatusThread(guild: any, applicant: GuildMember, appKey: AppKey, moderator?: GuildMember) {
  const status = await getStatusChannel(guild);
  if (!status) {
    console.error("[applications] Status channel not found or misconfigured.");
    return null;
  }
  const baseName = `${applicant.user.username} — ${APPS[appKey].label}`;
  let thread;
  try {
    const active = await status.threads.fetchActive();
    const existing = active?.threads?.find((t: any) => t.name.startsWith(baseName));
    thread =
      existing ??
      (await status.threads.create({
        name: `${baseName} • ${new Date().toLocaleDateString()}`,
        autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
        type: ChannelType.PrivateThread,
        reason: "Application status",
      }));
  } catch (err) {
    console.error("[applications] Error creating or fetching status thread:", err);
    return null;
  }
  // Add applicant to the thread
  try {
    await thread.members.add(applicant.id);
  } catch (err) {
    console.error(`[applications] Error adding applicant (${applicant.id}) to thread:`, err);
  }
  // Add moderator/admin to the thread if provided
  if (moderator) {
    try {
      await thread.members.add(moderator.id);
    } catch (err) {
      console.error(`[applications] Error adding moderator (${moderator.id}) to thread:`, err);
    }
  }
  return thread;
}

async function moveToArchiveAndDeleteReview(opts: {
  guild: any;
  appKey: AppKey;
  reviewMessage: any;
  applicant: GuildMember;
  moderator: GuildMember;
  decision: "Approved" | "Rejected";
  reason?: string;
}) {
  const archive = await getArchiveChannel(opts.guild);
  const appDef = APPS[opts.appKey];
  const orig = opts.reviewMessage?.embeds?.[0];
  const eb = new EmbedBuilder(orig?.data ?? {})
    .setTitle(`${appDef.emoji} ${appDef.label} — ${opts.decision}`)
    .setColor(opts.decision === "Approved" ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: "Moderator", value: `${opts.moderator} • \`${opts.moderator.user.tag}\`` },
      ...(opts.reason ? [{ name: "Reason", value: opts.reason.slice(0, 1024) }] : []),
    )
    .setTimestamp(new Date());

  if (archive) {
    await archive.send({ embeds: [eb] }).catch(() => {});
  }
  try {
    await opts.reviewMessage.delete();
  } catch {}
}

// refresh pinned panels (optional if PANEL_CHANNEL_ID set)
async function refreshApplicationPanelsIn(channel: TextChannel, guild: any) {
  try {
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (!pins) return;
    for (const m of pins.values()) {
      const hasAppEmbed = m.embeds?.some((e) => e.title === "Applications");
      if (!hasAppEmbed) continue;
      const keys = Object.keys(APPS) as AppKey[];
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < keys.length; i += 5) rows.push(appRow(keys.slice(i, i + 5), guild));
      await m.edit({ embeds: [buildBoardEmbed(guild)], components: rows }).catch(() => {});
    }
  } catch {}
}

// --- exported API ---
let wired = false;

export function initApplications(client: Client) {
  if (wired) return;
  wired = true;

  client.on("interactionCreate", async (i) => {
    try {
      if (!i.inCachedGuild()) return;

      // Open modal (capacity gate)
      if (i.isButton() && i.customId.startsWith("apply:")) {
        const key = i.customId.split(":")[1] as AppKey;
        if (!APPS[key]) return;

        if (isFull(i.guild, key)) {
          try {
            const patched = disableButtonOnMessage(i.message, i.customId);
            if (patched?.components) await i.message.edit(patched).catch(() => {});
          } catch {}
          await i.reply({ flags: MessageFlags.Ephemeral, content: `All **${APPS[key].label}** positions are currently filled.` });
          return;
        }

        await i.showModal(buildModal(key, i.user.id));
        return;
      }

      // Submit modal -> post to review channel
      if (i.isModalSubmit() && i.customId.startsWith("modal:")) {
        await i.deferReply({ flags: MessageFlags.Ephemeral }); // ACK
        const [, key, uid] = i.customId.split(":");
        const appKey = key as AppKey;
        if (!APPS[appKey]) return;

        const member = await i.guild.members.fetch(uid).catch(() => null);
        if (!member) {
          await i.editReply("Could not resolve your member record.");
          return;
        }

        const answers: Record<string, string> = {};
        APPS[appKey].questions.forEach((q) => {
          answers[q.id] = i.fields.getTextInputValue(q.id) ?? "";
        });

        const staffMention = STAFF_CSV.split(",")
          .map((s) => i.guild.roles.cache.find((r) => r.name.trim() === s.trim()))
          .filter(Boolean)
          .map((r) => `<@&${(r as Role).id}>`)
          .join(" ");

        const review = await i.guild.channels.fetch(REVIEW_CHANNEL_ID).catch(() => null);
        if (!review || review.type !== ChannelType.GuildText) {
          await i.editReply("Review channel is misconfigured.");
          return;
        }

        const msg = await (review).send({
          content: staffMention || undefined,
          embeds: [buildSubmissionEmbed(appKey, member, answers)],
          components: [reviewButtons(appKey, uid)],
        });

        await i.editReply(`Application submitted. Reference: ${msg.url}`);
        return;
      }

      // Review actions
      if (i.isButton() && i.customId.startsWith("review:")) {
        const gm = i.member;
        if (!gm.permissions.has(P.ManageGuild) && i.user.id !== OWNER_ID) {
          await i.reply({ flags: MessageFlags.Ephemeral, content: "Only staff can review applications." });
          return;
        }

        const [, action, key, applicantId] = i.customId.split(":");
        const appKey = key as AppKey;
        const applicant = await i.guild.members.fetch(applicantId).catch(() => null);
        if (!applicant) {
          await i.reply({ flags: MessageFlags.Ephemeral, content: "Applicant not found." });
          return;
        }

        if (action === "mark") {
          const statusThread = await getOrCreateStatusThread(i.guild, applicant, appKey, i.member).catch(() => null);
          if (statusThread) {
            await statusThread
              .send({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xf1c40f)
                    .setTitle(`${APPS[appKey].emoji} ${APPS[appKey].label} — Reviewed`)
                    .setDescription("A moderator has reviewed your application and will follow up soon."),
                ],
              })
              .catch(() => {});
          }
          return i.reply({ flags: MessageFlags.Ephemeral, content: "Marked as reviewed; status updated." });
        }

        if (action === "approve") {
          const granted = await grantRoleIfExists(applicant, APPS[appKey].roleName);

          await moveToArchiveAndDeleteReview({
            guild: i.guild,
            appKey,
            reviewMessage: i.message,
            applicant,
            moderator: i.member,
            decision: "Approved",
          });

          const statusThread = await getOrCreateStatusThread(i.guild, applicant, appKey, i.member).catch(() => null);
          if (statusThread) {
            await statusThread
              .send({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle(`${APPS[appKey].emoji} ${APPS[appKey].label} — Approved`)
                    .setDescription(`${applicant}, congrats! ${granted ? "Role granted." : "Role not found to grant."}`),
                ],
              })
              .catch(() => {});
          }
          try {
            await applicant.send(`✅ Your **${APPS[appKey].label}** application was approved.`);
          } catch {}

          if (PANEL_CHANNEL_ID) {
            const panelCh = await i.guild.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
            if (panelCh && panelCh.type === ChannelType.GuildText) {
              await refreshApplicationPanelsIn(panelCh, i.guild);
            }
          }

          if (!i.deferred && !i.replied)
            await i.reply({ flags: MessageFlags.Ephemeral, content: `Approved. ${granted ? "Role granted." : "Role not found."}` }).catch(() => {});
          return;
        }

        if (action === "reject") {
          const modal = new ModalBuilder().setCustomId(`reject:${appKey}:${applicantId}`).setTitle("Rejection Reason");
          const reason = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Why rejecting? (user will see this)")
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(512);
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
          await (i as ButtonInteraction).showModal(modal);
          return;
        }
      }

      // Handle rejection modal
      if (i.isModalSubmit() && i.customId.startsWith("reject:")) {
        const [, key, applicantId] = i.customId.split(":");
        const appKey = key as AppKey;
        const applicant = await i.guild.members.fetch(applicantId).catch(() => null);
        const reason = i.fields.getTextInputValue("reason") || "No reason provided.";

        await moveToArchiveAndDeleteReview({
          guild: i.guild,
          appKey,
          reviewMessage: i.message,
          applicant: applicant ?? (i.member),
          moderator: i.member,
          decision: "Rejected",
          reason,
        });

        if (applicant) {
          const statusThread = await getOrCreateStatusThread(i.guild, applicant, appKey, i.member).catch(() => null);
          if (statusThread) {
            await statusThread
              .send({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle(`${APPS[appKey].emoji} ${APPS[appKey].label} — Rejected`)
                    .setDescription(`Reason: ${reason}`),
                ],
              })
              .catch(() => {});
          }
          try {
            await applicant.send(`❌ Your **${APPS[appKey].label}** application was rejected.\nReason: ${reason}`);
          } catch {}
        }

        await i.reply({ flags: MessageFlags.Ephemeral, content: "Rejection recorded & archived." }).catch(() => {});
        return;
      }
    } catch (err) {
      console.error("[applications] interaction error:", err);
      if (i.isRepliable()) await i.reply({ flags: MessageFlags.Ephemeral, content: "Something went wrong." }).catch(() => {});
    }
  });
}

// Post the panel in a channel (call once)
export async function postApplicationsPanel(client: Client, guildId: string, channelIdOrName: string) {
  const guild = await client.guilds.fetch(guildId).then((g) => g.fetch());
  const me = await guild.members.fetchMe();

  const appChannel = await resolveTextChannelByIdOrName(client, guildId, channelIdOrName);
  const chkApp = needPerms(appChannel, me);
  if (!chkApp.ok) throw new Error(`Missing perms in #${appChannel.name}`);

  const review = await guild.channels.fetch(REVIEW_CHANNEL_ID).catch(() => null);
  if (!review || review.type !== ChannelType.GuildText) throw new Error("Review channel misconfigured.");
  const chkRev = needPerms(review, me);
  if (!chkRev.ok) throw new Error(`Missing perms in review #${(review).name}`);

  const keys = Object.keys(APPS) as AppKey[];
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < keys.length; i += 5) rows.push(appRow(keys.slice(i, i + 5), guild));

  const msg = await appChannel.send({ embeds: [buildBoardEmbed(guild)], components: rows });
  try {
    await msg.pin();
  } catch {}
  return msg.url;
}
