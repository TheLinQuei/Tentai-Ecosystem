/**
 * PHASE 4: Lore Mode Engine
 * 
 * Detects verse/lore context and automatically injects canon information.
 * Handles:
 * - Automatic detection of lore queries
 * - Explicit mode toggling
 * - Canon injection into chat context
 * - Mode persistence across sessions
 */

import { CanonResolver, CanonResolution } from './CanonResolver.js';

export interface LoreModeContext {
  enabled: boolean; // Is lore mode active?
  locked: boolean; // User explicitly locked mode?
  detected_entities: string[]; // Entities mentioned in query
  canon_resolution: CanonResolution | null;
  mode_reason: string; // Why lore mode was activated
}

export class LoreModeEngine {
  private canonResolver: CanonResolver;
  private userLorePreferences: Map<string, boolean>; // User preferences for lore mode
  private sessionLoreContext: Map<string, LoreModeContext>; // Session-specific context

  constructor() {
    this.canonResolver = new CanonResolver();
    this.userLorePreferences = new Map();
    this.sessionLoreContext = new Map();
  }

  /**
   * Determine if lore mode should be active for a message
   */
  async determineLoreMode(
    userId: string,
    message: string,
    userPreferences?: { default_lore_mode?: boolean },
    sessionId?: string
  ): Promise<LoreModeContext> {
    // Check explicit toggle commands
    const forceOn = /\b(lore mode|verse mode|enable lore|force lore)\b/i.test(message);
    const forceOff = /\b(no lore|disable lore|normal mode|exit verse)\b/i.test(message);

    // Get user preference (falls back to system default)
    // Only use stored preference if sessionId is provided (persistent session)
    // Otherwise, treat each query independently
    const userPreference = userPreferences?.default_lore_mode ?? 
      (sessionId ? this.userLorePreferences.get(userId) : false) ?? false;

    // Session context (overrides user preference if locked)
    const sessionContext = sessionId ? this.sessionLoreContext.get(sessionId) : null;
    const sessionLocked = sessionContext?.locked ?? false;

    // Determine final mode
    let enabled = userPreference;
    let reason = userPreference ? 'User default: lore mode enabled' : 'User default: lore mode disabled';

    if (forceOn) {
      enabled = true;
      reason = 'User explicit: lore mode enabled';
    } else if (forceOff) {
      enabled = false;
      reason = 'User explicit: lore mode disabled';
    } else if (!sessionLocked) {
      // Auto-detect runs when not session-locked
      const isLore = this.canonResolver.isLoreQuery(message);
      
      if (isLore) {
        // Lore keywords found - check if entities exist
        let hasEntities = false;
        try {
          const resolution = await this.canonResolver.resolveCanon(message);
          hasEntities = resolution.entities.length > 0;
        } catch {
          hasEntities = false;
        }

        if (hasEntities) {
          enabled = true;
          reason = 'Auto-detected: lore keywords + canon entities found';
        } else if (!userPreference) {
          // Only disable if user didn't explicitly want lore mode
          enabled = false;
          reason = 'Lore keywords present but no canon entities matched';
        }
      } else {
        // No lore keywords detected - disable even if user preference is true
        // (user preference only keeps lore mode on for ambiguous queries,
        // not for clearly non-lore queries like "What is 2+2?")
        if (userPreference) {
          // User wants lore by default, but this query has no lore indicators
          // Keep it enabled (user's choice to always have lore context)
          enabled = true;
          reason = 'User default: lore mode enabled';
        } else {
          enabled = false;
          reason = 'No lore keywords detected';
        }
      }
    }

    // If lore mode is enabled, resolve canon for the query
    let cannonResolution: CanonResolution | null = null;
    if (enabled) {
      try {
        // Re-resolve to get full resolution (cached or fresh)
        cannonResolution = await this.canonResolver.resolveCanon(message);
      } catch (err) {
        // Log but don't fail
        console.warn({ err, userId, message }, 'Failed to resolve canon');
      }
    }

    const context: LoreModeContext = {
      enabled,
      locked: sessionLocked && (forceOn || forceOff),
      detected_entities: cannonResolution?.entities.map((e) => e.id) || [],
      canon_resolution: cannonResolution,
      mode_reason: reason,
    };

    // Store session context
    if (sessionId) {
      this.sessionLoreContext.set(sessionId, context);
    }

    return context;
  }

  /**
   * Set user's default lore mode preference
   */
  setUserLorePreference(userId: string, enabled: boolean): void {
    this.userLorePreferences.set(userId, enabled);
  }

  /**
   * Get user's lore mode preference
   */
  getUserLorePreference(userId: string): boolean {
    return this.userLorePreferences.get(userId) ?? false;
  }

  /**
   * Inject canon information into context
   */
  async injectCanonContext(
    userId: string,
    message: string,
    userPreferences?: any,
    sessionId?: string
  ): Promise<{
    loreContext: LoreModeContext;
    injectedContext: string;
  }> {
    const loreContext = await this.determineLoreMode(userId, message, userPreferences, sessionId);

    if (!loreContext.enabled || !loreContext.canon_resolution) {
      return {
        loreContext,
        injectedContext: '',
      };
    }

    const resolution = loreContext.canon_resolution;

    // Build injected context
    let injectedContext = '**VERSE CONTEXT - ASTRALIS CANON:**\n\n';

    // Inject entity information
    if (resolution.entities.length > 0) {
      injectedContext += '**Known Entities:**\n';
      for (const entity of resolution.entities) {
        injectedContext += `- **${entity.name}** (${entity.type}): ${entity.description}\n`;
      }
      injectedContext += '\n';
    }

    // Inject facts
    if (resolution.facts.length > 0) {
      injectedContext += '**Canon Facts:**\n';
      for (const fact of resolution.facts) {
        const verificationBadge =
          fact.verification_status === 'canon'
            ? '✓'
            : fact.verification_status === 'extended_canon'
              ? '◆'
              : '?';
        injectedContext += `- ${verificationBadge} ${fact.predicate}: ${fact.value || fact.object_id}\n`;
      }
      injectedContext += '\n';
    }

    // Inject rules
    if (resolution.rules.length > 0) {
      injectedContext += '**Verse Rules:**\n';
      for (const rule of resolution.rules) {
        injectedContext += `- **${rule.title}**: ${rule.description}\n`;
      }
      injectedContext += '\n';
    }

    // Add citations
    if (resolution.citations.length > 0) {
      injectedContext += this.canonResolver.formatCitations(resolution.citations);
    }

    // Add warnings about contradictions
    if (resolution.warnings) {
      injectedContext += this.canonResolver.formatWarnings(resolution.warnings);
    }

    // Add uncertainty disclaimers
    if (resolution.uncertainties) {
      injectedContext += this.canonResolver.formatUncertainties(resolution.uncertainties);
    }

    injectedContext += '\n**Respond using canon information when available. Indicate uncertainty when facts are unavailable or disputed.**\n';

    return {
      loreContext,
      injectedContext,
    };
  }

  /**
   * Detect contradictions between response and canon
   */
  async detectCanonContradictions(
    userMessage: string,
    response: string,
    userId: string
  ): Promise<{ contradictions: string[]; severity: 'critical' | 'warning' | 'info' }> {
    const contradictions: string[] = [];
    let severity: 'critical' | 'warning' | 'info' = 'info';

    // Resolve canon for the query
    const resolution = await this.canonResolver.resolveCanon(userMessage);

    if (!resolution.facts || resolution.facts.length === 0) {
      return { contradictions, severity };
    }

    // Check if response contradicts any canonical facts
    for (const fact of resolution.facts) {
      if (fact.verification_status === 'canon' && fact.confidence > 0.9) {
        // This is high-confidence canon
        const factValue = fact.value?.toLowerCase() || '';
        const factObjectId = fact.object_id?.toLowerCase() || '';
        const responseLower = response.toLowerCase();

        // Simple heuristic: if response mentions contradictory terms
        if (
          factValue &&
          !responseLower.includes(factValue) &&
          !responseLower.includes('don\'t know') &&
          !responseLower.includes('uncertain')
        ) {
          contradictions.push(
            `Possible contradiction on ${fact.predicate}: Canon states "${factValue}" but response doesn't mention it`
          );
          severity = 'warning';
        }
      }
    }

    return { contradictions, severity };
  }

  /**
   * Format response with canon enforcement
   */
  formatCanonResponse(baseResponse: string, loreContext: LoreModeContext): string {
    if (!loreContext.enabled || !loreContext.canon_resolution) {
      return baseResponse;
    }

    const resolution = loreContext.canon_resolution;

    // Add confidence indicator if canon was used
    if (resolution.confidence < 0.5) {
      return baseResponse + '\n\n⚠️ *Limited canon information available for this query.*';
    }

    if (resolution.uncertainties && resolution.uncertainties.length > 0) {
      return baseResponse + '\n\n❓ *Some information about this is uncertain or disputed in canon.*';
    }

    return baseResponse;
  }
}
