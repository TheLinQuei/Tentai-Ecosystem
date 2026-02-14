// src/modules/pings.ts
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  Client, Colors, EmbedBuilder, Guild, GuildMember, MessageFlags,
  StringSelectMenuBuilder, PermissionFlagsBits as P
} from 'discord.js';
// TextChannel type not required here

const PING_ROLES = [
  { key:'ann',    name:'Announcements', emoji:'📣', desc:'major updates' },
  { key:'events', name:'Events',        emoji:'📅', desc:'raids & watch parties' },
  { key:'lfg',    name:'LFG',           emoji:'🎮', desc:'squad-up alerts' },
  { key:'lore',   name:'Lore Drops',    emoji:'📜', desc:'new Codex entries' },
  { key:'gifts',  name:'Giveaways',     emoji:'🎁', desc:'prizes & drawings' },
  { key:'patch',  name:'Patch Notes',   emoji:'🛠️', desc:'bot/server changelogs' },
  { key:'ops',    name:'Server Updates',emoji:'🔧', desc:'maintenance & outages' },
  { key:'play',   name:'Playtests',     emoji:'🧪', desc:'prototype sessions' },
  { key:'stream', name:'Streams',       emoji:'📡', desc:'go-live pings' },
  { key:'movies', name:'Movie Nights',  emoji:'🎬', desc:'watch parties' },
  { key:'market', name:'Marketplace',   emoji:'🛍️', desc:'buy/sell/trade' },
  { key:'polls',  name:'Polls',         emoji:'🗳️', desc:'votes & surveys' },
  { key:'drops',  name:'Drops',         emoji:'✨', desc:'content/asset drops' },
  { key:'support',name:'Support',       emoji:'🧩', desc:'helpdesk updates' },
  { key:'alerts', name:'Alerts',        emoji:'🚨', desc:'urgent notices' },
  { key:'devlog', name:'Devlog',        emoji:'🧭', desc:'builder notes' },
] as const;

type Key = typeof PING_ROLES[number]['key'];

const ENV_ID_BY_KEY: Partial<Record<Key, string>> = {
  ann:      process.env.ROLE_ANNOUNCEMENTS_ID,
  events:   process.env.ROLE_EVENTS_ID,
  lfg:      process.env.ROLE_LFG_ID,
  lore:     process.env.ROLE_LOREDROP_ID,
  gifts:    process.env.ROLE_GIVEAWAYS_ID,
  patch:    process.env.ROLE_PATCHNOTES_ID,
  ops:      process.env.ROLE_SERVERUPDATES_ID,
  play:     process.env.ROLE_PLAYTESTS_ID,
  stream:   process.env.ROLE_STREAMS_ID,
  movies:   process.env.ROLE_MOVIENIGHTS_ID,
  market:   process.env.ROLE_MARKETPLACE_ID,
  polls:    process.env.ROLE_POLLS_ID,
  drops:    process.env.ROLE_DROPS_ID,
  support:  process.env.ROLE_SUPPORT_ID,
  alerts:   process.env.ROLE_ALERTS_ID,
  devlog:   process.env.ROLE_DEVLOG_ID,
};

const ENV_NAME_BY_KEY: Partial<Record<Key, string>> = {
  ann:      process.env.ROLE_ANNOUNCEMENTS_NAME,
  events:   process.env.ROLE_EVENTS_NAME,
  lfg:      process.env.ROLE_LFG_NAME,
  lore:     process.env.ROLE_LOREDROP_NAME,
  gifts:    process.env.ROLE_GIVEAWAYS_NAME,
  patch:    process.env.ROLE_PATCHNOTES_NAME,
  ops:      process.env.ROLE_SERVERUPDATES_NAME,
  play:     process.env.ROLE_PLAYTESTS_NAME,
  stream:   process.env.ROLE_STREAMS_NAME,
  movies:   process.env.ROLE_MOVIENIGHTS_NAME,
  market:   process.env.ROLE_MARKETPLACE_NAME,
  polls:    process.env.ROLE_POLLS_NAME,
  drops:    process.env.ROLE_DROPS_NAME,
  support:  process.env.ROLE_SUPPORT_NAME,
  alerts:   process.env.ROLE_ALERTS_NAME,
  devlog:   process.env.ROLE_DEVLOG_NAME,
}; 

// const ROLE_ID_MAP: Partial<Record<typeof PING_ROLES[number]['key'], string>> =
//   (() => { try { return JSON.parse(process.env.PINGS_ROLE_IDS ?? '{}'); } catch { return {}; } })();

const SELECT_ID = 'pings:select';
const CLEAR_ID  = 'pings:clear';
const REMOVE_ID = 'pings:remove';
const PINGS_WIRED = Symbol.for('vi.pings.wired');
const OWNER_ID  = process.env.BOT_OWNER_ID ?? process.env.FORSA_ID;

/* ---------------- UI ---------------- */
function embed() {
  return new EmbedBuilder()
    .setColor(Colors.DarkButNotBlack)
    .setTitle('Choose your pings')
    .setDescription(PING_ROLES.map(r => `• ${r.emoji} **${r.name}** — ${r.desc}`).join('\n'));
}
function rowSelect() {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SELECT_ID)
      .setPlaceholder('Choose your pings')
      .setMinValues(0)
      .setMaxValues(PING_ROLES.length)
      .addOptions(PING_ROLES.map(r => ({ label: r.name, value: r.key, description: r.desc, emoji: r.emoji })))
  );
}
function rowButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CLEAR_ID).setStyle(ButtonStyle.Secondary).setLabel('Clear pings'),
    new ButtonBuilder().setCustomId(REMOVE_ID).setStyle(ButtonStyle.Danger).setLabel('Remove selector'),
  );
}

/* -------------- Role resolution (no creation) -------------- */
function findExistingRoleId(guild: Guild, key: Key, baseName: string, emoji: string) {
  // 1) Explicit ID (strongest)
  const id = ENV_ID_BY_KEY[key];
  if (id) {
    const byId = guild.roles.cache.get(id);
    if (byId) return byId.id;
  }

  // Build candidate names
  const envName = ENV_NAME_BY_KEY[key];
  const candidates = [
    envName,                           // exact env name (usually includes emoji)
    `${emoji} ${baseName}`,            // emoji + name (your screenshot format)
    baseName,                          // plain name (safety)
  ].filter(Boolean) as string[];

  for (const nm of candidates) {
    const hit = guild.roles.cache.find(r => r.name === nm);
    if (hit) return hit.id;
  }
  return undefined;
}

async function applySelection(gm: GuildMember, selectedKeys: string[]) {
  const defs = PING_ROLES;
  const want = new Set(selectedKeys as Key[]);

  const allIds: string[] = [];
  const wantIds: string[] = [];
  const missing: string[] = [];

  for (const def of defs) {
    const id = findExistingRoleId(gm.guild, def.key, def.name, def.emoji);
    if (!id) { missing.push(ENV_NAME_BY_KEY[def.key] ?? `${def.emoji} ${def.name}`); continue; }
    allIds.push(id);
    if (want.has(def.key)) wantIds.push(id);
  }

  const current = gm.roles.cache.filter(r => allIds.includes(r.id)).map(r => r.id);
  const toAdd = wantIds.filter(id => !current.includes(id));
  const toRemove = current.filter(id => !wantIds.includes(id));

  if (toAdd.length)    { try { await gm.roles.add(toAdd, 'Ping selector'); } catch {} }
  if (toRemove.length) { try { await gm.roles.remove(toRemove, 'Ping selector'); } catch {} }

  const nameById = (id: string) => gm.guild.roles.cache.get(id)?.name ?? id;
  return { added: toAdd.map(nameById), removed: toRemove.map(nameById), missing };
}

/* ---------------- API ---------------- */
export async function postPingSelectorPanel(guild: Guild, channelId: string) {
  const ch = await guild.channels.fetch(channelId);
  if (!ch || ch.type !== ChannelType.GuildText) throw new Error('Target channel is not a text channel');
  const msg = await (ch).send({ embeds: [embed()], components: [rowSelect(), rowButtons()] });
  try { await msg.pin(); } catch {}
  return msg;
}

export function initPingSelector(client: Client) {
  if ((client as any)[PINGS_WIRED]) return;
  (client as any)[PINGS_WIRED] = true;

  client.on('interactionCreate', async (i) => {
    if (!i.inCachedGuild()) return;

    // --- SELECT (multi) ---
    if (i.isStringSelectMenu() && i.customId === SELECT_ID) {
      try { if (!i.deferred && !i.replied) await i.deferReply({ flags: MessageFlags.Ephemeral }); } catch {}
      try {
        const gm = await i.guild.members.fetch(i.user.id);
        const { added, removed, missing } = await applySelection(gm, i.values);
        const lines = [
          added.length   ? `✅ Added: ${added.join(', ')}`     : '',
          removed.length ? `🧹 Removed: ${removed.join(', ')}` : '',
          missing.length ? `⚠️ Missing (not mapped/present): ${missing.join(', ')}` : '',
        ].filter(Boolean).join('\n') || 'No change.';
        await i.editReply({ content: lines }).catch(() => {});
      } catch (e: any) {
        await i.editReply({ content: `Error: ${e?.message ?? e}` }).catch(() => {});
      }
      return;
    }

    // --- CLEAR (remove only the roles this selector manages, if they exist) ---
    if (i.isButton() && i.customId === CLEAR_ID) {
      try { if (!i.deferred && !i.replied) await i.deferReply({ flags: MessageFlags.Ephemeral }); } catch {}
      try {
        const gm = await i.guild.members.fetch(i.user.id);

        // Resolve the managed role IDs using our new resolver signature (no creation)
        const allIds = PING_ROLES
          .map(def => findExistingRoleId(gm.guild, def.key, def.name, def.emoji))
          .filter(Boolean) as string[];

        const toRemove = gm.roles.cache.filter(r => allIds.includes(r.id));
        const removedNames = toRemove.map(r => r.name);

        if (toRemove.size) {
          await gm.roles.remove([...toRemove.keys()], 'Ping selector clear').catch(() => {});
        }

        const msg =
          removedNames.length
            ? `🧹 Cleared: ${removedNames.join(', ')}`
            : 'No ping roles to clear.';

        await i.editReply({ content: msg }).catch(() => {});
      } catch (e: any) {
        await i.editReply({ content: `Error: ${e?.message ?? e}` }).catch(() => {});
      }
      return;
    }

    // --- REMOVE (staff-only: delete the selector message) ---
    if (i.isButton() && i.customId === REMOVE_ID) {
      const gm = i.member;
      if (!gm.permissions.has(P.ManageGuild) && i.user.id !== OWNER_ID) {
        return i.reply({ content: 'Only staff can remove this.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      try { await i.message.delete().catch(() => {}); } catch {}
      if (!i.replied && !i.deferred) {
        try { await i.reply({ content: 'Removed.', flags: MessageFlags.Ephemeral }); } catch {}
      }
    }
  });
}

