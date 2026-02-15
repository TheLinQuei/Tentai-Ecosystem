import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits as P,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  Colors,
  Guild,
  MessageFlags,
} from "discord.js";

// keep this ID the same as your component listener:
const SELECT_ID = "faction.pick";

type FactionKey = "cel" | "aku" | "mor" | "ind";
type FactionDef = { key: FactionKey; label: string; emoji: string; idEnv?: string; nameEnv?: string };
type HybridDef = { keys: [FactionKey, FactionKey]; name: string; emoji: string; locked?: boolean };

const FACTIONS: FactionDef[] = [
  { key: "cel", label: "Celestials",   emoji: "✨",
    idEnv: process.env.ROLE_CELESTIAL_ID,    nameEnv: process.env.ROLE_CELESTIAL_NAME },
  { key: "aku", label: "Akuma",        emoji: "🩸",
    idEnv: process.env.ROLE_AKUMA_ID,        nameEnv: process.env.ROLE_AKUMA_NAME },
  { key: "mor", label: "Mortal-Born",  emoji: "⚔️",
    idEnv: process.env.ROLE_MORTAL_ID,       nameEnv: process.env.ROLE_MORTAL_NAME },
  { key: "ind", label: "Independents", emoji: "🌿",
    idEnv: process.env.ROLE_INDEPENDENT_ID,  nameEnv: process.env.ROLE_INDEPENDENT_NAME },
];

const HYBRIDS: HybridDef[] = [
  { keys: ["aku", "cel"], name: "Eclipsar",     emoji: "🌗", locked: true },
  { keys: ["cel", "ind"], name: "Aetherborn",   emoji: "🌤️", locked: true },
  { keys: ["cel", "mor"], name: "Luminari",     emoji: "💫", locked: true },
  { keys: ["aku", "ind"], name: "Blightwalker", emoji: "🌑", locked: true },
  { keys: ["aku", "mor"], name: "Dreadmarked",  emoji: "🔥", locked: true },
  { keys: ["ind", "mor"], name: "Warden",       emoji: "🐾", locked: true },
];

function resolveRoleId(guild: Guild, f: FactionDef): string | undefined {
  if (f.idEnv) {
    const byId = guild.roles.cache.get(f.idEnv);
    if (byId) return byId.id;
  }
  const candidates = [f.nameEnv, `${f.emoji} ${f.label}`, f.label].filter(Boolean) as string[];
  for (const nm of candidates) {
    const hit = guild.roles.cache.find(r => r.name === nm);
    if (hit) return hit.id;
  }
  return undefined;
}

/** Auto-create missing hybrid roles based on env config */
async function ensureHybridRoles(guild: Guild): Promise<string[]> {
  const created: string[] = [];
  
  for (const h of HYBRIDS) {
    const [a, b] = h.keys.sort();
    const upA = a.toUpperCase();
    const upB = b.toUpperCase();
    const idVar = (process.env as any)[`ROLE_HYBRID_${upA}_${upB}_ID`] as string | undefined;
    const nameVar = (process.env as any)[`ROLE_HYBRID_${upA}_${upB}_NAME`] as string | undefined;

    // Skip if ID is set and exists
    if (idVar && guild.roles.cache.has(idVar)) continue;

    // Check if role exists by name
    const targetName = nameVar || `${h.emoji} ${h.name}`;
    const existing = guild.roles.cache.find(r => r.name === targetName);
    if (existing) continue;

    // Create the role
    try {
      const newRole = await guild.roles.create({
        name: targetName,
        color: getHybridColor(h),
        reason: `Auto-created hybrid role for ${h.name}`,
      });
      created.push(newRole.name);
      console.log(`[factions] Created hybrid role: ${newRole.name} (${newRole.id})`);
    } catch (e) {
      console.error(`[factions] Failed to create hybrid role ${h.name}:`, e);
    }
  }

  return created;
}

/** Auto-create missing base faction roles */
async function ensureFactionRoles(guild: Guild): Promise<string[]> {
  const created: string[] = [];
  const factionColors: Record<FactionKey, number> = {
    cel: 0xFFFFFF, // White/Silver for Celestials
    aku: 0x8B0000, // Dark Red for Akuma
    mor: 0x8B7355, // Brown for Mortal-Born
    ind: 0x228B22, // Forest Green for Independents
  };

  for (const f of FACTIONS) {
    // Check if already exists by ID or name
    if (resolveRoleId(guild, f)) continue;

    const targetName = f.nameEnv || `${f.emoji} ${f.label}`;
    
    try {
      const newRole = await guild.roles.create({
        name: targetName,
        color: factionColors[f.key],
        reason: `Auto-created base faction role for ${f.label}`,
      });
      created.push(newRole.name);
      console.log(`[factions] Created faction role: ${newRole.name} (${newRole.id})`);
    } catch (e) {
      console.error(`[factions] Failed to create faction role ${f.label}:`, e);
    }
  }

  return created;
}

/** Assign color based on hybrid type */
function getHybridColor(h: HybridDef): number {
  // Map hybrid keys to Discord color codes
  const colorMap: Record<string, number> = {
    "aku-cel": 0x7B68EE,  // Medium Purple (Eclipsar - light/dark balance)
    "cel-ind": 0x87CEEB,  // Sky Blue (Aetherborn - celestial freedom)
    "cel-mor": 0xFFD700,  // Gold (Luminari - celestial heroism)
    "aku-ind": 0x8B008B,  // Dark Magenta (Blightwalker - dark independence)
    "aku-mor": 0xDC143C,  // Crimson (Dreadmarked - dark warriors)
    "ind-mor": 0x8B7355,  // Brown (Warden - grounded protectors)
  };
  const key = h.keys.sort().join("-");
  return colorMap[key] || 0x99AAB5; // Default gray
}

export const data = new SlashCommandBuilder()
  .setName("factions")
  .setDescription("ADMIN: Post the faction selector")
  .setDefaultMemberPermissions(P.ManageGuild)
  .setDMPermission(false);

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.inCachedGuild()) return;
  if (!i.memberPermissions?.has(P.ManageGuild)) {
    return i.reply({ content: "Nope.", flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });

  // Auto-create any missing base faction roles
  const createdFactions = await ensureFactionRoles(i.guild);
  // Auto-create any missing hybrid roles
  const createdHybrids = await ensureHybridRoles(i.guild);
  
  const allCreated = [...createdFactions, ...createdHybrids];
  const createdMsg = allCreated.length ? `\n✅ Created: ${allCreated.join(", ")}` : "";

  // Build options only for roles that actually exist
  const opts: StringSelectMenuOptionBuilder[] = [];
  for (const f of FACTIONS) {
    const id = resolveRoleId(i.guild, f);
    if (!id) continue;
    opts.push(new StringSelectMenuOptionBuilder()
      .setLabel(`${f.emoji} ${f.label}`)
      .setValue(id)
      .setDescription("Cosmetic only"));
  }
  if (!opts.length) {
    return i.editReply("No faction roles resolved. Check your env IDs/names.");
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SELECT_ID)
    .setPlaceholder("Choose your allegiance(s) — pick up to 2 for a hybrid role")
    .setMinValues(0)
    .setMaxValues(opts.length) // allow multi-select (up to all 4)
    .addOptions(opts);

  // Build hybrid list dynamically
  const hybridLines = HYBRIDS.map(h => {
    const [a, b] = h.keys;
    const fA = FACTIONS.find(f => f.key === a);
    const fB = FACTIONS.find(f => f.key === b);
    const lockTag = h.locked ? " (requires shop unlock)" : "";
    return `• ${h.emoji} **${fA?.label} + ${fB?.label}** → **${h.name}**${lockTag}`;
  });

  await i.channel!.send({
    embeds: [
      new EmbedBuilder()
        .setColor(Colors.Aqua)
        .setTitle("Factions (Optional)")
        .setDescription([
          "Pick one or more factions. They're cosmetic, but fun!",
          "",
          "✨ **Choose exactly two?** You'll earn a special **hybrid role** for that combo:",
          ...hybridLines,
          "",
          "_More or fewer than two? No hybrid; just the base faction roles._",
        ].join("\n")),
    ],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });

  await i.editReply(`Posted.${createdMsg}`);
}
