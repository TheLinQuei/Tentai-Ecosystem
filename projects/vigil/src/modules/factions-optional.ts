import { Client, Guild, MessageFlags } from "discord.js";
import { prisma } from "@/db/prisma";

/** Optional but recommended */

type FactionKey = "cel" | "aku" | "mor" | "ind";
type FactionDef = { key: FactionKey; label: string; emoji: string; idEnv?: string; nameEnv?: string };

const SELECT_ID = "faction.pick";

// Configure from env (IDs preferred, names optional). No non-null assertions.
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

/** Map hybrid pair to unlock SKU */
const HYBRID_UNLOCK_SKUS: Record<string, string> = {
  "aku_cel": "eclipsar-unlock",
  "cel_ind": "aetherborn-unlock",
  "cel_mor": "luminari-unlock",
  "aku_ind": "blightwalker-unlock",
  "aku_mor": "dreadmarked-unlock",
  "ind_mor": "warden-unlock",
};

/** Check if user owns the hybrid unlock for a specific faction pair */
async function checkHybridUnlock(userId: string, guildId: string, keyA: FactionKey, keyB: FactionKey): Promise<boolean> {
  const [a, b] = [keyA, keyB].sort();
  const pairKey = `${a}_${b}`;
  const sku = HYBRID_UNLOCK_SKUS[pairKey];
  
  if (!sku) return false; // No SKU defined for this pair
  
  try {
    const inv = await prisma.ecoInventory.findFirst({
      where: { userId, guildId, sku },
    });
    return !!inv;
  } catch {
    return false;
  }
}

/** Get hybrid name for display */
function getHybridName(keyA: FactionKey, keyB: FactionKey): string {
  const [a, b] = [keyA, keyB].sort();
  const names: Record<string, string> = {
    "aku_cel": "Eclipsar",
    "cel_ind": "Aetherborn",
    "cel_mor": "Luminari",
    "aku_ind": "Blightwalker",
    "aku_mor": "Dreadmarked",
    "ind_mor": "Warden",
  };
  return names[`${a}_${b}`] || "Unknown Hybrid";
}

/** Resolve an existing role ID. Priority: explicit ID → env name → "emoji label" → plain label. */
function resolveRoleId(guild: Guild, f: FactionDef): string | undefined {
  if (f.idEnv) {
    const byId = guild.roles.cache.get(f.idEnv);
    if (byId) return byId.id;
  }
  const candidates = [
    f.nameEnv,                       // exact env-provided name, if any
    `${f.emoji} ${f.label}`,         // e.g., "✨ Celestials"
    f.label,                         // "Celestials"
  ].filter(Boolean) as string[];

  for (const nm of candidates) {
    const hit = guild.roles.cache.find(r => r.name === nm);
    if (hit) return hit.id;
  }
  return undefined;
}

/* ---------------- Runtime wiring ---------------- */
export function initOptionalFactions(client: Client) {
  client.on("interactionCreate", async (i) => {
    try {
      // Selection (member picks/changes factions) — now supports multi-select + hybrid role
      if (i.isStringSelectMenu() && i.customId === SELECT_ID && i.inCachedGuild()) {
        const guild = i.guild;
        const gm = await guild.members.fetch(i.user.id);

        // Resolve faction role IDs we manage (existing only)
        const managedIds = FACTIONS.map(f => resolveRoleId(guild, f)).filter(Boolean) as string[];
        const selectedIds = new Set<string>(i.values); // empty if user deselects everything

        // Build map roleId -> faction key for hybrid detection
        const idToKey = new Map<string, FactionKey>();
        for (const f of FACTIONS) {
          const rid = resolveRoleId(guild, f);
          if (rid) idToKey.set(rid, f.key);
        }
        const selectedKeys: FactionKey[] = [...selectedIds]
          .map((rid) => idToKey.get(rid))
          .filter((x): x is FactionKey => Boolean(x));

        // HYBRID LOCK: Check if selecting exactly 2 factions without the required unlock
        const uniqueKeys = new Set(selectedKeys);
        if (uniqueKeys.size === 2) {
          const [keyA, keyB] = [...uniqueKeys].sort() as [FactionKey, FactionKey];
          const hasUnlock = await checkHybridUnlock(i.user.id, guild.id, keyA, keyB);
          
          if (!hasUnlock) {
            const hybridName = getHybridName(keyA, keyB);
            const sku = HYBRID_UNLOCK_SKUS[`${keyA}_${keyB}`];
            
            return i.reply({
              content: [
                `⚠️ **${hybridName} Hybrid Locked**`,
                "",
                `The **${FACTIONS.find(f => f.key === keyA)?.label} + ${FACTIONS.find(f => f.key === keyB)?.label}** combination grants the **${hybridName}** hybrid role.`,
                "This powerful mix requires a special unlock.",
                "",
                `🛒 **Purchase the ${hybridName} unlock** from \`/shop\` (SKU: \`${sku}\`)`,
                "Or choose a different combination!",
              ].join("\n"),
              flags: MessageFlags.Ephemeral,
            });
          }
        }

        // Compute add/remove for base faction roles
        const toRemove = gm.roles.cache.filter(r => managedIds.includes(r.id) && !selectedIds.has(r.id));
        const toAdd: string[] = [];
        for (const rid of managedIds) {
          if (selectedIds.has(rid) && !gm.roles.cache.has(rid)) toAdd.push(rid);
        }

        if (toRemove.size) await gm.roles.remove([...toRemove.keys()]).catch(() => {});
        if (toAdd.length) await gm.roles.add(toAdd).catch(() => {});

        // Helper: resolve hybrid role id for a pair of keys via env or by name (use const fn to avoid inner declaration rule)
        const resolveHybridRoleId = (g: Guild, a: FactionKey, b: FactionKey): string | undefined => {
          const [A, B] = [a, b].sort();
          const upA = A.toUpperCase();
          const upB = B.toUpperCase();
          const idVar = (process.env as any)[`ROLE_HYBRID_${upA}_${upB}_ID`] as string | undefined;
          const nameVar = (process.env as any)[`ROLE_HYBRID_${upA}_${upB}_NAME`] as string | undefined;

          if (idVar) {
            const byId = g.roles.cache.get(idVar);
            if (byId) return byId.id;
          }
          if (nameVar) {
            const byName = g.roles.cache.find(r => r.name === nameVar);
            if (byName) return byName.id;
          }
          return undefined;
        };

        // All hybrid role ids we might manage (to clean up stale hybrids)
        const ALL_PAIRS: Array<[FactionKey, FactionKey]> = [
          ["cel","aku"],["cel","mor"],["cel","ind"],["aku","mor"],["aku","ind"],["mor","ind"],
        ];
        const managedHybridIds = ALL_PAIRS
          .map(([a,b]) => resolveHybridRoleId(guild, a, b))
          .filter(Boolean) as string[];

        // Decide hybrid application: exactly two factions → add that hybrid; otherwise remove all hybrids
        let hybridMsg = "";
        if (new Set(selectedKeys).size === 2) {
          const [a, b] = [...new Set(selectedKeys)].sort() as [FactionKey, FactionKey];
          const targetHybrid = resolveHybridRoleId(guild, a, b);

          // Remove other hybrids first
          const staleHybrids = gm.roles.cache.filter(r => managedHybridIds.includes(r.id) && r.id !== targetHybrid);
          if (staleHybrids.size) await gm.roles.remove([...staleHybrids.keys()]).catch(() => {});

          if (targetHybrid && !gm.roles.cache.has(targetHybrid)) {
            await gm.roles.add(targetHybrid).catch(() => {});
            hybridMsg = " + hybrid";
          } else if (!targetHybrid) {
            // No configured hybrid for this pair — ensure none linger
            const anyHybrids = gm.roles.cache.filter(r => managedHybridIds.includes(r.id));
            if (anyHybrids.size) await gm.roles.remove([...anyHybrids.keys()]).catch(() => {});
          }
        } else {
          // Remove any configured hybrid if not exactly two
          const anyHybrids = gm.roles.cache.filter(r => managedHybridIds.includes(r.id));
          if (anyHybrids.size) await gm.roles.remove([...anyHybrids.keys()]).catch(() => {});
        }

        const parts: string[] = [];
        if (toAdd.length) parts.push(`+ ${toAdd.length}`);
        if (toRemove.size) parts.push(`– ${toRemove.size}`);
        const summary = parts.length ? `Updated your faction roles (${parts.join(", ")}${hybridMsg}).` : `No changes.`;

        return i.reply({ content: summary, flags: MessageFlags.Ephemeral });
      }
    } catch (e) {
      console.error("[factions-optional]", e);
      if (i.isRepliable()) {
        if (i.deferred || i.replied) {
          await i.editReply({ content: "Error." }).catch(() => {});
        } else {
          await i.reply({ content: "Error.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }
    }
  });
}
