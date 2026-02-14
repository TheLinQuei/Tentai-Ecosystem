/**
 * Identity Module - Phase D.1 Scaffold
 * 
 * Models identity zones (public/private/trusted) and per-user identity profiles
 * with public/private aliases and intimate addressing preferences.
 * 
 * No hard-coded human names. User ID is the only hard anchor.
 */

import type { Observation } from './observer.js';

export type IdentityZone = 'PUBLIC_GUILD' | 'PRIVATE_DM' | 'TRUSTED';

export interface IdentityPrefsTraits {
  publicAliases?: string[];
  privateAliases?: string[];
  allowAutoIntimate?: boolean;
}

export interface IdentityProfile {
  userId: string;
  publicAliases: string[];   // e.g. Discord display name, username, nicknames
  privateAliases: string[];  // e.g. intimate names, only for private/trusted
  allowAutoIntimate: boolean;
  lastKnownDisplayName?: string;
  lastUpdated: string;
}

/**
 * Resolve identity zone from observation.
 * - If guildId is present => public guild
 * - If no guildId        => DM (private)
 * Trust logic can be expanded later (e.g. dev channels, voice, flags).
 */
export function resolveIdentityZone(obs: Observation): IdentityZone {
  if (!obs.guildId) return 'PRIVATE_DM';
  // Phase D.1: everything with a guildId is PUBLIC_GUILD by default.
  // Future: add TRUSTED channels/contexts.
  return 'PUBLIC_GUILD';
}

/**
 * Build a minimal identity profile from observation + optional memory entity.
 * No hard-coded names; everything comes from Discord + memory.
 */
export function buildIdentityProfile(opts: {
  obs: Observation;
  userEntity?: {
    id: string;
    aliases: string[];
    traits: Record<string, any>;
    display: string;
  };
}): IdentityProfile {
  const { obs, userEntity } = opts;

  const now = new Date().toISOString();

  // Phase D.3: Read identity traits from memory
  const identityTraits: IdentityPrefsTraits =
    (userEntity?.traits?.identity as IdentityPrefsTraits) || {};

  // First, build privateAliases set for exclusion
  const privateAliases =
    Array.isArray(identityTraits.privateAliases)
      ? identityTraits.privateAliases.filter((a) => typeof a === 'string' && a.trim())
      : [];
  const privateAliasSet = new Set(privateAliases.map(a => a.toLowerCase()));

  const basePublicAliases = new Set<string>();

  // Phase D.4: Prefer REAL Discord display name from observation (authorDisplayName)
  // This is the actual display name from the Discord member object, NOT from memory aliases
  const discordRealName = obs.authorDisplayName;
  
  // Discord-level names (memory entity display is now SECONDARY, real Discord name is PRIMARY)
  // Only add if not in privateAliases
  if (discordRealName && !privateAliasSet.has(discordRealName.toLowerCase())) {
    basePublicAliases.add(discordRealName);
  }
  if (userEntity?.display && !discordRealName && !privateAliasSet.has(userEntity.display.toLowerCase())) {
    basePublicAliases.add(userEntity.display);
  }
  // Only add general aliases if they're NOT in privateAliases
  if (Array.isArray(userEntity?.aliases)) {
    for (const a of userEntity.aliases) {
      if (typeof a === 'string' && a.trim() && !privateAliasSet.has(a.trim().toLowerCase())) {
        basePublicAliases.add(a.trim());
      }
    }
  }

  // Stored public aliases from traits (also exclude if in privateAliases)
  if (Array.isArray(identityTraits.publicAliases)) {
    for (const a of identityTraits.publicAliases) {
      if (typeof a === 'string' && a.trim() && !privateAliasSet.has(a.trim().toLowerCase())) {
        basePublicAliases.add(a.trim());
      }
    }
  }

  // Fallback to authorId if nothing else
  if (basePublicAliases.size === 0) {
    basePublicAliases.add(obs.authorId);
  }

  const publicAliases = Array.from(basePublicAliases);

  const allowAutoIntimate =
    typeof identityTraits.allowAutoIntimate === 'boolean'
      ? identityTraits.allowAutoIntimate
      : false;

  return {
    userId: obs.authorId,
    publicAliases,
    privateAliases,
    // Phase D.4: Use REAL Discord display name, not memory alias
    lastKnownDisplayName: discordRealName ?? userEntity?.display,
    allowAutoIntimate,
    lastUpdated: now,
  };
}

export interface AddressingChoice {
  primaryName: string;   // what the model should normally call the user
  safeName: string;      // always safe/public alias
  intimateName?: string; // optional, only for private/trusted contexts
  useIntimate: boolean;
}

/**
 * Decide how Vi should address the user based on identity zone + profile.
 * - PUBLIC_GUILD: never use private/intimate aliases
 * - PRIVATE_DM/TRUSTED: can use private aliases if allowed and present
 */
export function chooseAddressing(
  zone: IdentityZone,
  profile: IdentityProfile
): AddressingChoice {
  // GUARDRAIL: In public guilds, NEVER use intimate addressing, period.
  // Even if upstream data is corrupted, this prevents intimate alias leakage.
  if (zone === 'PUBLIC_GUILD') {
    const discordDisplayName = profile.lastKnownDisplayName;
    const publicAlias = profile.publicAliases[0];
    const authorId = profile.userId;
    
    // Build candidate safeName with fallback chain
    let safeName = (discordDisplayName && discordDisplayName.trim()) || 
                   (publicAlias && publicAlias.trim()) || 
                   authorId;

    // CRITICAL: Check if safeName is contaminated by private alias - if so, use authorId fallback
    if (profile.privateAliases.length > 0 && profile.privateAliases.some(pa => pa.toLowerCase() === safeName.toLowerCase())) {
      console.warn(
        `⚠️ Identity leak detected: safeName "${safeName}" matches private alias in PUBLIC_GUILD context. ` +
        `Using authorId fallback. User: ${authorId}, publicAliases: ${JSON.stringify(profile.publicAliases)}, ` +
        `privateAliases: ${JSON.stringify(profile.privateAliases)}`
      );
      safeName = authorId; // Force to authorId as last resort
    }

    return {
      primaryName: safeName,
      safeName,
      intimateName: undefined,
      useIntimate: false,
    };
  }

  // PRIVATE_DM or TRUSTED: normal logic continues
  const discordDisplayName = profile.lastKnownDisplayName;
  const publicAlias = profile.publicAliases[0];
  const authorId = profile.userId;

  // Fallback chain: use first non-empty value
  const safeName = (discordDisplayName && discordDisplayName.trim()) || 
                   (publicAlias && publicAlias.trim()) || 
                   authorId;

  // Only use private/intimate aliases in PRIVATE_DM or TRUSTED zone and if allowed
  const intimateCandidate = profile.privateAliases[0];
  const canUseIntimate =
    (zone === 'PRIVATE_DM' || zone === 'TRUSTED') &&
    profile.allowAutoIntimate &&
    typeof intimateCandidate === 'string' &&
    intimateCandidate.trim().length > 0;

  if (canUseIntimate) {
    return {
      primaryName: safeName,
      safeName,
      intimateName: intimateCandidate!,
      useIntimate: true,
    };
  }

  return {
    primaryName: safeName,
    safeName,
    intimateName: undefined,
    useIntimate: false,
  };
}
