import { GuildMember } from "discord.js";
import { readWeightsMap } from "./storage";

/**
 * Resolves the vote weight for a guild member.
 * - Prioritizes highest weighted role
 * - Ignores roles not in the map
 * - Returns 1 if no weighted roles match
 */
export async function getWeightForMember(member: GuildMember): Promise<number> {
  if (!member || !member.guild || !member.roles?.cache) return 1;

  const map = await readWeightsMap(member.guild.id); // roleId -> weight
  if (!map || typeof map !== "object") return 1;

  let maxWeight = 1;
  for (const role of member.roles.cache.values()) {
    const weight = map[role.id];
    if (typeof weight === "number" && isFinite(weight) && weight > maxWeight) {
      maxWeight = weight;
    }
  }

  return maxWeight;
}