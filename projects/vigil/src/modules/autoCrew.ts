// src/modules/autoCrew.ts
import { Client, GuildMember } from "discord.js";

/**
 * Auto-assign the base "Crew" role to every new member.
 * Env:
 *  - CREW_ROLE_ID (preferred)
 *  - CREW_ROLE_NAME (fallback, defaults to "Crew (Unpledged)" then "Crew")
 */
export function initAutoCrew(client: Client) {
  // DISABLED: Role assignment now handled by oathbound.ts after Discord screening completes
  // This prevents giving roles immediately on join before members accept rules
  console.log("[autoCrew] Module disabled - using oathbound onboarding system");
}
