/**
 * PHASE 4: Canon Auto-Injection
 *
 * Detects lore-relevant queries and auto-injects canonical context.
 * Prevents hallucination by grounding Vi in verified canon facts.
 *
 * Responsibilities:
 * - Detect lore-relevant queries (heuristics: entity mentions, verse keywords)
 * - Query CanonResolver for canonical facts
 * - Inject facts into perception.context.canonContext
 * - Prevent hallucination (if no canon → "No canon record")
 * - Provide citations for canon usage
 */

import { LoreModeEngine, LoreModeContext } from './LoreModeEngine.js';
import { CanonResolver, CanonResolution } from './CanonResolver.js';
import type { UserProfile } from '../profile.js';

/**
 * CanonContext: structured canon information to inject into perception
 */
export interface CanonContext {
  enabled: boolean; // Was canon detection active?
  detected_entities: string[]; // Entity IDs found in query
  canon_resolution: CanonResolution | null; // Resolved canon facts/rules/entities
  injected_text: string; // Formatted context string for LLM
  mode_reason: string; // Why lore mode was triggered
  has_contradictions: boolean; // Does response contradict canon?
  contradiction_corrections?: string[]; // Suggested corrections if contradictions found
}

export class CanonInjector {
  private loreModeEngine: LoreModeEngine;

  constructor() {
    this.loreModeEngine = new LoreModeEngine();
  }

  /**
   * Detect if a query is lore-relevant based on heuristics
   *
   * Heuristics:
   * - Mentions of known entities (Movado, Azula, Kaelen, Akima, etc.)
   * - Verse keywords (Astralis, timeline, verse, canon, lore)
   * - Explicit lore mode commands ("lore mode", "check canon", etc.)
   * - Questions about Astralis verse
   */
  detect(input: string): boolean {
    if (!input) return false;

    // Explicit toggles (highest confidence)
    if (/\b(lore mode|verse mode|enable lore|force lore|check canon)\b/i.test(input)) {
      return true;
    }

    // Known entity mentions (high confidence)
    const entityKeywords = [
      'movado',
      'azula',
      'kaelen',
      'akima',
      'astralis',
      'sovereign',
      'codex',
      'timeline',
      'verse',
      'fraction',
      'traveler',
    ];
    if (entityKeywords.some((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(input))) {
      return true;
    }

    // Lore-specific question patterns
    if (
      /\b(who is|what is|tell me|explain|describe|history of|origin of|role of)\b.*\b(movado|azula|kaelen|akima)\b/i.test(
        input
      )
    ) {
      return true;
    }

    // Verse rule questions
    if (
      /\b(rule|law|cannot|must|can|should|prohibited|forbidden|allowed)\b.*\b(astralis|timeline|verse|sovereign)\b/i.test(
        input
      )
    ) {
      return true;
    }

    // Default: not lore-relevant
    return false;
  }

  /**
   * Inject canon context into perception
   *
   * Steps:
   * 1. Check if query is lore-relevant
   * 2. If yes: use LoreModeEngine to resolve canon facts
   * 3. Format canon context for LLM injection
   * 4. Return structured CanonContext
   */
  async injectCanon(
    input: string,
    userId: string,
    sessionId: string,
    userProfile?: UserProfile
  ): Promise<CanonContext> {
    // Step 1: Detect lore relevance
    const isLoreRelevant = this.detect(input);

    if (!isLoreRelevant) {
      return {
        enabled: false,
        detected_entities: [],
        canon_resolution: null,
        injected_text: '',
        mode_reason: 'Query not lore-relevant',
        has_contradictions: false,
      };
    }

    // Step 2: Use LoreModeEngine to resolve canon
    // Note: userProfile doesn't have lore_mode field, so we don't pass preferences
    const { loreContext, injectedContext } = await this.loreModeEngine.injectCanonContext(
      userId,
      input,
      undefined, // No user preferences available
      sessionId
    );

    // Step 3: Build CanonContext
    const canonContext: CanonContext = {
      enabled: loreContext.enabled,
      detected_entities: loreContext.detected_entities,
      canon_resolution: loreContext.canon_resolution,
      injected_text: injectedContext,
      mode_reason: loreContext.mode_reason,
      has_contradictions: false, // Will be checked after response generation
      contradiction_corrections: undefined,
    };

    // HARD ENFORCEMENT: If lore mode enabled but no canon entities found, inject refusal instruction
    if (loreContext.enabled && (!loreContext.canon_resolution || loreContext.canon_resolution.entities.length === 0)) {
      canonContext.injected_text = 
        '**CANON ENFORCEMENT:**\n\n' +
        'This query appears to be about Astralis lore, but no canon record exists for the requested information.\n\n' +
        '**YOU MUST NOT SPECULATE OR INVENT INFORMATION.**\n\n' +
        'Your response must be: "No canon record found for this query. I cannot provide information beyond established Astralis canon."\n\n' +
        'Do not elaborate. Do not speculate. Do not invent plausible-sounding lore.';
      canonContext.mode_reason = 'Canon enforcement: no canon record found';
    }

    return canonContext;
  }

  /**
   * Detect contradictions between response and canon
   *
   * Used in post-generation verification to catch hallucinations
   */
  async detectContradictions(
    userMessage: string,
    response: string,
    canonContext: CanonContext
  ): Promise<{
    has_contradictions: boolean;
    corrections: string[];
  }> {
    if (!canonContext.enabled || !canonContext.canon_resolution) {
      return { has_contradictions: false, corrections: [] };
    }

    try {
      const result = await this.loreModeEngine.detectCanonContradictions(
        userMessage,
        response,
        'unknown-user' // userId not available in this context
      );
      return {
        has_contradictions: result.contradictions.length > 0,
        corrections: result.contradictions,
      };
    } catch (err) {
      // Log but don't fail
      console.warn({ err, userMessage }, 'Failed to detect canon contradictions');
      return { has_contradictions: false, corrections: [] };
    }
  }

  /**
   * Set user's lore mode preference
   *
   * Can be called to set persistent user preference for lore mode
   */
  setUserLorePreference(userId: string, enabled: boolean): void {
    this.loreModeEngine.setUserLorePreference(userId, enabled);
  }

  /**
   * Get user's lore mode preference
   */
  getUserLorePreference(userId: string): boolean {
    return this.loreModeEngine.getUserLorePreference(userId);
  }
}
