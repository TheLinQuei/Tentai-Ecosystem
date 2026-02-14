// src/modules/lfg.ts
import {
  Client, Guild, TextChannel, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags,
  StringSelectMenuInteraction, ButtonInteraction,
  PermissionFlagsBits, Snowflake, APIEmbedField, ChannelType,
} from "discord.js";

type LfgId = string;
type Seat = { roles: string[]; voice?: string };
type Roster = Map<Snowflake, Seat>;

export type LfgPayload = {
  ownerId: Snowflake;
  channelId: Snowflake;
  game: string;
  mode: string;
  timeWindow: string;
  slots: number;
  reqs?: string;
  voiceChoices: { id: string; label: string }[];
};

type LfgState = {
  guildId: Snowflake;
  ownerId: Snowflake;
  channelId: Snowflake;
  game: string;
  mode: string;
  timeWindow: string;
  slots: number;
  reqs?: string;
  createdAt: number;
  closed?: boolean;

  rolePack?: string;
  roleOptions: string[];
  chosenRoles: Map<Snowflake, string[]>;
  platforms: string[];
  region?: string;
  matchTypes: string[];
  tags: string[];

  roster: Roster;

  bannerUrl?: string;
};

const LFG_ROLE_ID = process.env.LFG_ROLE_ID ?? "1413792315419398185";

async function pingRoleOnce(
  guild: Guild,
  roleId: string,
  send: (mention: string) => Promise<unknown>
) {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) throw new Error("LFG role not found");
  const needsToggle = !role.mentionable;

  if (needsToggle) {
    try { await role.setMentionable(true, "temporary LFG ping"); } catch {}
  }
  try {
    await send(`<@&${role.id}>`);
  } finally {
    if (needsToggle) {
      try { await role.setMentionable(false, "restore mentionable"); } catch {}
    }
  }
}

const ROLE_PACKS: Record<string, string[]> = {
  "Any / Not Applicable": ["Any"],
  "MMO / Co-op": ["Tank", "Healer", "DPS", "Support", "Utility", "Flex", "Leader"],
  "Shooter (Tac/BR/Arena)": ["IGL", "Entry", "Support", "Flex", "Fragger", "Sniper", "Anchor"],
  "MOBA": ["Top", "Jungle", "Mid", "ADC", "Support", "Roamer"],
  "RTS": ["Macro", "Micro", "Harass", "Turtle", "Rush", "Caster"],
  "RPG / Party": ["Frontline", "Backline", "CC", "Burst", "Support", "Flex"],
  "Fighting": ["Any Character", "Zoner", "Grappler", "Rushdown", "Footsies"],
  "Sports (Team)": ["Any", "Offense", "Defense", "Playcaller", "Striker/Forward", "Midfield", "Goalie", "QB", "WR", "RB", "Center"],
  "Racing": ["Driver", "Tuner", "Host", "Spotter"],
  "Survival / Crafting": ["Builder", "Hunter", "Gatherer", "Scout", "Crafter"],
  "Horror / Co-op": ["Host", "Runner", "Puzzle", "Tracker", "Bait"],
  "Social Deduction": ["Host", "Investigator", "Chaos", "Quiet", "Any"],
};
const PLATFORM_OPTS = ["PC", "Xbox", "PlayStation", "Switch", "Mobile", "Crossplay"];
// const REGION_OPTS = ["Any", "NA-East", "NA-West", "EU", "SA", "APAC", "SEA", "JP", "AU/NZ", "ME", "AFR"];
// const MATCHTYPE_OPTS = ["Ranked", "Unranked", "Custom", "Co-op/Campaign", "Event/Tournament", "Scrim", "Casual"];
// const TAG_OPTS = [
//   "Mic Required", "No Mic", "KB+M", "Controller", "Family Friendly", "18+",
//   "Beginner Friendly", "Experienced Only", "Blind Run", "Achievement Hunt",
//   "Speedrun", "Mods/Customs OK", "No Crossplay", "Crossplay On",
// ];

const LFG = new Map<LfgId, LfgState>();

function formatRoster(guild: Guild, roster: Roster, cap: number) {
  if (!roster.size) return `Nobody yet — **${cap}** slots open.`;
  const lines: string[] = [];
  for (const [uid, seat] of roster) {
    const roles = seat.roles.length ? seat.roles.join(", ") : "Any";
    const voice = seat.voice ? ` • 🎙️ ${seat.voice}` : "";
    lines.push(`• <@${uid}> — ${roles}${voice}`);
  }
  const open = Math.max(0, cap - roster.size);
  lines.push(open ? `\n**${open}** slot${open === 1 ? "" : "s"} open.` : `\n**Full.**`);
  return lines.join("\n");
}

function odysseyColor() { return 0xe7c978; }

function buildEmbed(state: LfgState, guild: Guild) {
  const filters: string[] = [];
  if (state.rolePack) filters.push(`Role Pack: **${state.rolePack}**`);
  if (state.platforms.length) filters.push(`Platform: **${state.platforms.join(", ")}**`);
  if (state.region) filters.push(`Region: **${state.region}**`);
  if (state.matchTypes.length) filters.push(`Match: **${state.matchTypes.join(", ")}**`);
  if (state.tags.length) filters.push(`Tags: **${state.tags.join(", ")}**`);

  const fields: APIEmbedField[] = [];
  if (state.reqs) fields.push({ name: "Reqs", value: state.reqs.slice(0, 1024) });
  if (filters.length) fields.push({ name: "Filters", value: filters.join(" • ").slice(0, 1024) });
  fields.push({ name: "Roster", value: formatRoster(guild, state.roster, state.slots).slice(0, 1024) });

  const eb = new EmbedBuilder()
    .setColor(odysseyColor())
    .setTitle(`🧭 LFG • ${state.game}`)
    .setDescription(`**Mode/Roles:** ${state.mode}\n**Window:** ${state.timeWindow}`)
    .setFields(fields)
    .setFooter({ text: state.closed ? "Closed" : "Open" })
    .setTimestamp(state.createdAt);

  if (state.bannerUrl) eb.setImage(state.bannerUrl);
  return eb;
}

function rolePackSelect(lfgId: LfgId, chosen?: string, disabled = false) {
  const sel = new StringSelectMenuBuilder()
    .setCustomId(`lfg:rolepack:${lfgId}`)
    .setPlaceholder("Role Pack (optional)")
    .setMinValues(0).setMaxValues(1).setDisabled(disabled);
  for (const p of Object.keys(ROLE_PACKS)) {
    sel.addOptions(new StringSelectMenuOptionBuilder().setLabel(p).setValue(p).setDefault(Boolean(chosen && chosen === p)));
  }
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel);
}
function rolesSelect(lfgId: LfgId, roleOptions: string[], disabled = false) {
  const roles = roleOptions?.length ? roleOptions : ["Any"];
  const sel = new StringSelectMenuBuilder()
    .setCustomId(`lfg:roles:${lfgId}`)
    .setPlaceholder("Choose role(s) — optional")
    .setMinValues(0).setMaxValues(Math.min(3, roles.length)).setDisabled(disabled);
  for (const r of roles) sel.addOptions(new StringSelectMenuOptionBuilder().setLabel(r).setValue(r));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel);
}
function voiceSelect(lfgId: LfgId, voices: { id: string; label: string }[], disabled = false) {
  const sel = new StringSelectMenuBuilder()
    .setCustomId(`lfg:voice:${lfgId}`)
    .setPlaceholder("Comms — optional")
    .setMinValues(0).setMaxValues(1).setDisabled(disabled);
  for (const v of voices) sel.addOptions(new StringSelectMenuOptionBuilder().setLabel(`Discord: ${v.label}`).setValue(v.label));
  sel.addOptions(
    new StringSelectMenuOptionBuilder().setLabel("In-game VOIP").setValue("In-game VOIP"),
    new StringSelectMenuOptionBuilder().setLabel("No voice").setValue("No voice"),
  );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel);
}
function platformSelect(lfgId: LfgId, disabled = false) {
  const sel = new StringSelectMenuBuilder()
    .setCustomId(`lfg:platform:${lfgId}`)
    .setPlaceholder("Platforms — optional")
    .setMinValues(0).setMaxValues(4).setDisabled(disabled);
  for (const p of PLATFORM_OPTS) sel.addOptions(new StringSelectMenuOptionBuilder().setLabel(p).setValue(p));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel);
}
function controlButtons(lfgId: LfgId, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`lfg:join:${lfgId}`).setLabel("Join").setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`lfg:leave:${lfgId}`).setLabel("Leave").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`lfg:ping:${lfgId}`).setEmoji("🔔").setLabel("Ping LFG").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`lfg:close:${lfgId}`).setEmoji("🛑").setLabel("Close").setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}
function components(lfgId: LfgId, state: LfgState, voices: { id: string; label: string }[], disabled = false) {
  return [
    rolePackSelect(lfgId, state.rolePack, disabled),
    rolesSelect(lfgId, state.roleOptions, disabled),
    voiceSelect(lfgId, voices, disabled),
    platformSelect(lfgId, disabled),
    controlButtons(lfgId, disabled),
  ];
}

async function findHouseBanner(guild: Guild): Promise<string | undefined> {
  const idFromEnv = process.env.ASSETS_CHANNEL_ID;
  const chan =
    (idFromEnv ? guild.channels.cache.get(idFromEnv) : null) ||
    guild.channels.cache.find(c => c.type === ChannelType.GuildText && /house-assets/i.test(c.name));

  if (!chan || chan.type !== ChannelType.GuildText) return;

  const getPinnedArray = async () => {
    const pins: any = await chan.messages.fetchPins().catch(() => null);
    if (!pins) return [] as any[];
    const it =
      pins?.messages?.values?.()
      ?? pins?.values?.();
    if (!it) return [] as any[];
    return Array.from(it);
  };

  try {
    const msgs = await getPinnedArray();
    for (const m of msgs) {
      const hit = [...m.attachments.values()].find((att: any) =>
        /\.(png|jpe?g|webp)$/i.test(att.name || '') &&
        /(odyssey|lfg|banner)/i.test(att.name || '')
      );
      if (hit) return hit.url;
    }
    for (const m of msgs) {
      const hit = [...m.attachments.values()].find((att: any) =>
        /\.(png|jpe?g|webp)$/i.test(att.name || '')
      );
      if (hit) return hit.url;
    }
  } catch {}
}

export async function postLfgPanel(guild: Guild, payload: LfgPayload) {
  const channel = guild.channels.cache.get(payload.channelId) as TextChannel;
  if (!channel || !channel.isTextBased()) throw new Error("Text channel not found");

  const state: LfgState = {
    guildId: guild.id,
    ownerId: payload.ownerId,
    channelId: payload.channelId,
    game: payload.game.trim(),
    mode: payload.mode.trim(),
    timeWindow: payload.timeWindow.trim(),
    slots: Math.max(1, Math.min(12, payload.slots || 4)),
    reqs: payload.reqs?.trim(),
    createdAt: Date.now(),
    roster: new Map(),

    rolePack: undefined,
    roleOptions: ROLE_PACKS["Any / Not Applicable"],
    chosenRoles: new Map(),
    platforms: [],
    region: undefined,
    matchTypes: [],
    tags: [],

    bannerUrl: await findHouseBanner(guild),
  };

  const msg = await channel.send({
    embeds: [buildEmbed(state, guild)],
    components: components("temp", state, payload.voiceChoices),
  });

  const lfgId = msg.id;
  LFG.set(lfgId, state);
  await msg.edit({
    embeds: [buildEmbed(state, guild)],
    components: components(lfgId, state, payload.voiceChoices),
  });

  return { id: lfgId, message: msg };
}

function isOwnerOrStaff(i: ButtonInteraction | StringSelectMenuInteraction, s: LfgState) {
  if (i.user.id === s.ownerId) return true;
  const m = i.guild!.members.cache.get(i.user.id);
  return Boolean(m?.permissions.has(PermissionFlagsBits.ManageMessages));
}

export function initLfgHandlers(client: Client) {
  client.on("interactionCreate", async (i) => {
    if (!i.guild) return;

    if (i.isStringSelectMenu() && i.customId.startsWith("lfg:")) {
      const [, kind, lfgId] = i.customId.split(":");
      const s = LFG.get(lfgId);
      if (!s) return i.reply({ content: "This LFG expired.", flags: MessageFlags.Ephemeral });

      try {
        if (kind === "rolepack") {
          s.rolePack = i.values[0];
          s.roleOptions = ROLE_PACKS[s.rolePack] ?? ROLE_PACKS["Any / Not Applicable"];
          const msg = await i.channel!.messages.fetch(lfgId);
          await msg.edit({
            embeds: [buildEmbed(s, i.guild)],
            components: [
              rolePackSelect(lfgId, s.rolePack),
              rolesSelect(lfgId, s.roleOptions),
              (() => {
                const row = msg.components?.[2];
                return row ?? voiceSelect(lfgId, []);
              })(),
              platformSelect(lfgId),
              controlButtons(lfgId),
            ],
          });
          return i.deferUpdate();
        }
        if (kind === "roles") {
          const roles = [...new Set(i.values)].slice(0, 3);
          s.chosenRoles.set(i.user.id, roles);
          const seat = s.roster.get(i.user.id) ?? { roles: [], voice: undefined };
          seat.roles = roles;
          s.roster.set(i.user.id, seat);
          return i.update({ embeds: [buildEmbed(s, i.guild)], components: i.message.components });
        }
        if (kind === "voice") {
          const voice = i.values[0];
          const seat = s.roster.get(i.user.id) ?? { roles: [] };
          seat.voice = voice;
          s.roster.set(i.user.id, seat);
          return i.update({ embeds: [buildEmbed(s, i.guild)], components: i.message.components });
        }
        if (kind === "platform") {
          s.platforms = [...new Set(i.values)].slice(0, 4);
          return i.update({ embeds: [buildEmbed(s, i.guild)], components: i.message.components });
        }
      } catch (e) {
        console.warn("LFG select error:", e);
        return i.reply({ content: "That didn’t work. Try again.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }

    if (i.isButton() && i.customId.startsWith("lfg:")) {
      const [, action, lfgId] = i.customId.split(":");
      const s = LFG.get(lfgId);
      if (!s) return i.reply({ content: "This LFG expired.", flags: MessageFlags.Ephemeral });

      const msg = i.message;
      try {
        if (action === "join") {
          if (s.closed) return i.reply({ content: "This LFG is closed.", flags: MessageFlags.Ephemeral });
          if (s.roster.size >= s.slots) return i.reply({ content: "Roster is full.", flags: MessageFlags.Ephemeral });
          const seat = s.roster.get(i.user.id) ?? { roles: s.chosenRoles.get(i.user.id) ?? [], voice: undefined };
          s.roster.set(i.user.id, seat);
          await msg.edit({ embeds: [buildEmbed(s, i.guild)], components: msg.components });
          return i.reply({ content: "You're in.", flags: MessageFlags.Ephemeral });
        }
        if (action === "leave") {
          s.roster.delete(i.user.id);
          s.chosenRoles.delete(i.user.id);
          await msg.edit({ embeds: [buildEmbed(s, i.guild)], components: msg.components });
          return i.reply({ content: "Removed from roster.", flags: MessageFlags.Ephemeral });
        }
        if (action === "ping") {
          try {
            if (!i.inCachedGuild()) return i.reply({ content: "Can’t ping here.", flags: MessageFlags.Ephemeral });
            await i.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
            await pingRoleOnce(i.guild, LFG_ROLE_ID, async (mention) => {
              await (i.channel as TextChannel).send({
                content: `${mention} ${i.user} is looking for a group!`,
                allowedMentions: { roles: [LFG_ROLE_ID] },
              });
            });
            await i.editReply({ content: "Ping sent." }).catch(() => {});
          } catch {
            await i.editReply({
              content: "I couldn't ping the LFG role. Ensure my role is above the LFG role and I have **Manage Roles**."
            }).catch(() => {});
          }
          return;
        }
        if (action === "close") {
          if (!isOwnerOrStaff(i, s)) return i.reply({ content: "Only the organizer or staff can close.", flags: MessageFlags.Ephemeral });
          s.closed = true;
          await i.update({
            embeds: [buildEmbed(s, i.guild)],
            components: [
              rolePackSelect(lfgId, s.rolePack, true),
              rolesSelect(lfgId, s.roleOptions, true),
              voiceSelect(lfgId, [], true),
              platformSelect(lfgId, true),
              controlButtons(lfgId, true),
            ],
          });
          return;
        }
      } catch (e) {
        console.warn("LFG button error:", e);
        return i.reply({ content: "That didn’t work. Try again.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });
}
