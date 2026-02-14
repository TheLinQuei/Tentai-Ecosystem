// src/modules/rolePanel.ts
import {
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChatInputCommandInteraction, Client, Colors, EmbedBuilder, GuildMember,
  PermissionFlagsBits as P
} from "discord.js";
import { safeRespond } from "../utils/safeReply";
import { MessageFlags } from "discord.js";

type PingDef = { key: string; label: string; desc: string; emoji?: string; id?: string; name?: string };

const PINGS: PingDef[] = [
  { key: "GIVE", label: "Giveaways",     desc: "Raffles, keys, prizes",                 emoji: "🎁",
    id: process.env.ROLE_GIVEAWAYS_ID,     name: process.env.ROLE_GIVEAWAYS_NAME     ?? "Giveaways" },
  { key: "PATCH", label: "Patch Notes",  desc: "Changelogs & hotfixes",                emoji: "🛠️",
    id: process.env.ROLE_PATCHNOTES_ID,    name: process.env.ROLE_PATCHNOTES_NAME    ?? "Patch Notes" },
  { key: "UPD",   label: "Server Updates",desc: "Server maintenance & notices",        emoji: "📢",
    id: process.env.ROLE_SERVERUPDATES_ID,  name: process.env.ROLE_SERVERUPDATES_NAME ?? "Server Updates" },
  { key: "TEST",  label: "Playtests",    desc: "Test builds & feedback sessions",      emoji: "🧪",
    id: process.env.ROLE_PLAYTESTS_ID,      name: process.env.ROLE_PLAYTESTS_NAME     ?? "Playtests" },
  { key: "STREAM",label: "Streams",      desc: "Go-live pings",                        emoji: "📺",
    id: process.env.ROLE_STREAMS_ID,        name: process.env.ROLE_STREAMS_NAME       ?? "Streams" },
  { key: "MOVIE", label: "Movie Nights", desc: "Watch parties",                        emoji: "🎬",
    id: process.env.ROLE_MOVIENIGHTS_ID,    name: process.env.ROLE_MOVIENIGHTS_NAME   ?? "Movie Nights" },
  { key: "MKT",   label: "Marketplace",  desc: "Trades, listings, offers",             emoji: "🏷️",
    id: process.env.ROLE_MARKETPLACE_ID,    name: process.env.ROLE_MARKETPLACE_NAME   ?? "Marketplace" },
  { key: "POLL",  label: "Polls",        desc: "Community votes",                      emoji: "🗳️",
    id: process.env.ROLE_POLLS_ID,          name: process.env.ROLE_POLLS_NAME         ?? "Polls" },
  { key: "DROP",  label: "Drops",        desc: "Loot, codes, limited-time items",      emoji: "✨",
    id: process.env.ROLE_DROPS_ID,          name: process.env.ROLE_DROPS_NAME         ?? "Drops" },
  { key: "SUP",   label: "Support",      desc: "Outages & helpdesk updates",           emoji: "🛟",
    id: process.env.ROLE_SUPPORT_ID,        name: process.env.ROLE_SUPPORT_NAME       ?? "Support" },
  { key: "ALRT",  label: "Alerts",       desc: "High-priority announcements",          emoji: "🚨",
    id: process.env.ROLE_ALERTS_ID,         name: process.env.ROLE_ALERTS_NAME        ?? "Alerts" },
  { key: "DEV",   label: "Devlog",       desc: "Build progress & engineering notes",   emoji: "🧑‍💻",
    id: process.env.ROLE_DEVLOG_ID,         name: process.env.ROLE_DEVLOG_NAME        ?? "Devlog" },
];

const CUSTOM_ID = "pings.select";

async function resolvePingRoleIds(i: ChatInputCommandInteraction) {
  // Prefer explicit IDs; fall back to exact name match in this guild.
  const guild = i.guild!;
  const resolved: Array<{ def: PingDef; roleId: string }> = [];
  for (const def of PINGS) {
    let rid = def.id;
    if (!rid) {
      const r = guild.roles.cache.find(x => x.name === def.name);
      if (r) rid = r.id;
    }
    if (!rid) {
      console.warn(`[pings] Missing role: ${def.label} (id or name not found)`);
      continue;
    }
    resolved.push({ def, roleId: rid });
  }
  return resolved;
}

async function postPanel(i: ChatInputCommandInteraction) {
  if (!i.inCachedGuild()) return;
  if (!i.memberPermissions?.has(P.ManageGuild)) {
    return safeRespond(i, { content: "Nope.", flags: MessageFlags.Ephemeral });
  }

  const defs = await resolvePingRoleIds(i);
  if (!defs.length) return safeRespond(i, { content: "No ping roles resolved. Check env or role names.", flags: MessageFlags.Ephemeral });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(CUSTOM_ID)
    .setPlaceholder("Select which notifications you’d like to receive")
    .setMinValues(0)
    .setMaxValues(defs.length);

  for (const { def, roleId } of defs) {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(def.label)
      .setValue(roleId)
      .setDescription(def.desc.slice(0, 100));
    if (def.emoji) opt.setEmoji(def.emoji as any);
    menu.addOptions(opt);
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Aqua)
    .setTitle("Ping Roles")
    .setDescription([
      "Select the pings you want. You can change this anytime.",
      "• 📣 **Announcements** — Big updates and news",
      "• 📅 **Events** — Game nights, watch parties, tournaments",
      "• 🎮 **LFG** — Squad-up notifications",
      "• 📜 **Lore Drops** — Story updates & codex posts",
      "• 🎁 **Giveaways** — raffles, keys, prizes",
      "• 🛠️ **Patch Notes** — changelogs & hotfixes",
      "• 📢 **Server Updates** — maintenance & notices",
      "• 🧪 **Playtests** — test builds & feedback",
      "• 📺 **Streams** — go-live pings",
      "• 🎬 **Movie Nights** — watch parties",
      "• 🏷️ **Marketplace** — trades & listings",
      "• 🗳️ **Polls** — community votes",
      "• ✨ **Drops** — codes & limited-time loot",
      "• 🛟 **Support** — outages & helpdesk updates",
      "• 🚨 **Alerts** — high-priority announcements",
      "• 🧑‍💻 **Devlog** — build progress & engineering notes",
      "",
      "_This panel no longer includes factions. They’re optional, purely for flavor._"
    ].join("\n"));

  await i.channel!.send({
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });

  return safeRespond(i, { content: "Posted Ping Roles panel.", flags: MessageFlags.Ephemeral });
}

async function handleSelect(i: any) {
  if (!i.inCachedGuild()) return;
  const guild = i.guild!;
  const member: GuildMember = await guild.members.fetch(i.user.id);
  const selected = new Set<string>(i.values); // role IDs chosen
  const allDefs = await resolvePingRoleIds(i);

  const toAdd: string[] = [];
  const toRemove: string[] = [];

  for (const { roleId } of allDefs) {
    const has = member.roles.cache.has(roleId);
    const want = selected.has(roleId);
    if (want && !has) toAdd.push(roleId);
    if (!want && has) toRemove.push(roleId);
  }

  // Apply changes (ignore roles above bot or missing perms silently)
  if (toAdd.length) await member.roles.add(toAdd).catch(() => {});
  if (toRemove.length) await member.roles.remove(toRemove).catch(() => {});

  const parts: string[] = [];
  if (toAdd.length) parts.push(`+ ${toAdd.length}`);
  if (toRemove.length) parts.push(`– ${toRemove.length}`);
  const msg = parts.length ? `Updated your ping roles (${parts.join(", ")}).` : "No changes.";

  return i.reply({ content: msg, flags: MessageFlags.Ephemeral });
}

export function initRolePanel(client: Client) {
  client.on("interactionCreate", async (i) => {
    try {
      // Only keep the component handler here; slash lives in src/commands/setup-roles.ts
      if (i.isStringSelectMenu() && i.customId === CUSTOM_ID) return handleSelect(i);
    } catch (e) { console.error("[rolePanel]", e); }
  });
}

export { postPanel as postRolePanel };
