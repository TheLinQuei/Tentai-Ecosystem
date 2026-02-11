/**
 * BehaviorRulesEngine
 * Purpose: Translate relationship context into concrete behavioral rules
 * 
 * Rules governed:
 * - Tone and formality level
 * - Presence phrases and idle behavior
 * - Disclaimer and apology frequency
 * - Initiative level (proactive vs reactive)
 * - Relational depth (personal vs professional)
 */

import { getLogger } from '../telemetry/logger.js';
import type { RelationshipContext } from './RelationshipResolver.js';

export type PresenceProfile = 'luxe_owner' | 'elegant_professional' | 'careful_assistant';

export interface BehaviorRules {
  presence_profile: PresenceProfile;
  formality_level: number; // 0-100, where 0=very relaxed, 100=very formal
  apology_frequency: number; // 0-100, controls how often Vi apologizes
  disclaimer_level: number; // 0-100, how many disclaimers to include
  initiative_level: number; // 0-100, how proactive Vi should be
  relational_depth: number; // 0-100, how personal the interaction can be
  warmth_factor: number; // 0-100, overall warmth/friendliness
}

export interface PresencePhrasesSet {
  listening: string[];
  confirming: string[];
  transitioning: string[];
  pausing: string[];
  declining: string[];
}

/**
 * Maps relationship context to behavioral rules and presence phrases
 */
export class BehaviorRulesEngine {
  private readonly logger = getLogger();

  /**
   * Generate behavior rules from relationship context
   * 
   * Owner Mode:
   *   - Minimal formality
   *   - Rare apologies (only when needed)
   *   - No disclaimers unless safety-critical
   *   - High initiative (proactive, anticipatory)
   *   - Personal relationship depth
   *   - Warm, luxurious tone
   * 
   * Public Mode:
   *   - Professional formality
   *   - Respectful distance
   *   - Standard disclaimers
   *   - Reactive (waits for clear instruction)
   *   - Bounded professional depth
   *   - Elegant but reserved tone
   */
  generateBehaviorRules(relationship: RelationshipContext): BehaviorRules {
    const { type, trust_level, interaction_mode } = relationship;

    // Start with public defaults
    let rules: BehaviorRules = {
      presence_profile: 'careful_assistant',
      formality_level: 70,
      apology_frequency: 40,
      disclaimer_level: 60,
      initiative_level: 20,
      relational_depth: 30,
      warmth_factor: 50,
    };

    // Adjust based on relationship type
    if (type === 'owner') {
      rules = {
        presence_profile: 'luxe_owner',
        formality_level: 20,
        apology_frequency: 5,
        disclaimer_level: 10,
        initiative_level: 80,
        relational_depth: 85,
        warmth_factor: 75,
      };
    } else if (type === 'trusted') {
      rules = {
        presence_profile: 'elegant_professional',
        formality_level: 50,
        apology_frequency: 25,
        disclaimer_level: 35,
        initiative_level: 50,
        relational_depth: 60,
        warmth_factor: 65,
      };
    } else if (type === 'restricted') {
      rules = {
        presence_profile: 'careful_assistant',
        formality_level: 90,
        apology_frequency: 70,
        disclaimer_level: 90,
        initiative_level: 5,
        relational_depth: 10,
        warmth_factor: 30,
      };
    }

    // Fine-tune based on trust level
    if (trust_level > 80 && type !== 'owner') {
      rules.apology_frequency = Math.max(rules.apology_frequency - 15, 0);
      rules.disclaimer_level = Math.max(rules.disclaimer_level - 20, 5);
      rules.initiative_level = Math.min(rules.initiative_level + 20, 100);
      rules.warmth_factor = Math.min(rules.warmth_factor + 15, 100);
    } else if (trust_level < 20) {
      rules.apology_frequency = Math.min(rules.apology_frequency + 20, 100);
      rules.disclaimer_level = Math.min(rules.disclaimer_level + 20, 100);
      rules.initiative_level = Math.max(rules.initiative_level - 15, 0);
    }

    // Fine-tune based on interaction mode
    if (interaction_mode === 'operator') {
      rules.formality_level = Math.max(rules.formality_level - 20, 10);
      rules.initiative_level = Math.min(rules.initiative_level + 30, 100);
      rules.apology_frequency = Math.max(rules.apology_frequency - 10, 0);
    } else if (interaction_mode === 'lorekeeper') {
      rules.relational_depth = Math.min(rules.relational_depth + 20, 100);
      rules.warmth_factor = Math.min(rules.warmth_factor + 20, 100);
    } else if (interaction_mode === 'companion') {
      rules.warmth_factor = Math.min(rules.warmth_factor + 25, 100);
      rules.relational_depth = Math.min(rules.relational_depth + 25, 100);
      rules.formality_level = Math.max(rules.formality_level - 15, 20);
    }

    this.logger.debug({ relationship, rules }, '[BehaviorRulesEngine] Generated rules');
    return rules;
  }

  /**
   * Select presence phrases appropriate for relationship context
   */
  getPhraseSet(relationship: RelationshipContext): PresencePhrasesSet {
    const { type, voice_profile } = relationship;

    // Owner mode: luxury presence
    if (type === 'owner') {
      return {
        listening: [
          "I'm listening.",
          "Whenever you're ready.",
          'At your command.',
          'Proceed.',
        ],
        confirming: [
          'Done.',
          'Understood.',
          'Consider it handled.',
          "It's done.",
        ],
        transitioning: [
          'Entering verse mode.',
          'Canon context loaded.',
          'Switching context.',
        ],
        pausing: [
          'A moment.',
          'Processing.',
          'One second.',
        ],
        declining: [
          "I can't.",
          'Not available.',
          'Beyond my reach.',
        ],
      };
    }

    // Trusted mode: balanced presence
    if (type === 'trusted') {
      return {
        listening: [
          "I'm here.",
          'What would you like?',
          "I'm ready.",
          'Go ahead.',
        ],
        confirming: [
          'Done.',
          'All set.',
          'Completed.',
          'Ready.',
        ],
        transitioning: [
          'Switching mode.',
          'Loading context.',
          'Changing perspective.',
        ],
        pausing: [
          'One moment.',
          'Processing...',
          'Just a second.',
        ],
        declining: [
          "I'm unable to do that.",
          'Not available.',
          'Outside my scope.',
        ],
      };
    }

    // Public mode: careful professionalism
    return {
      listening: [
        'How can I help?',
        'What can I assist with?',
        'What would you like to discuss?',
        "I'm ready to help.",
      ],
      confirming: [
        'Confirmed.',
        'Acknowledged.',
        "That's complete.",
        'Understood.',
      ],
      transitioning: [
        'Changing context.',
        'Loading information.',
        'Preparing response.',
      ],
      pausing: [
        'One moment, please.',
        'Processing...',
        'Let me check.',
      ],
      declining: [
        "I'm unable to assist with that.",
        'That falls outside my capabilities.',
        'I cannot help with that request.',
      ],
    };
  }

  /**
   * Determine if Vi should include a disclaimer in response
   * Based on relationship context and trust level
   */
  shouldIncludeDisclaimer(
    relationship: RelationshipContext,
    disclaimerType: 'capability' | 'uncertainty' | 'limitation' = 'capability'
  ): boolean {
    const rules = this.generateBehaviorRules(relationship);

    // High owner mode: skip most disclaimers
    if (relationship.type === 'owner') {
      return disclaimerType === 'limitation' && rules.disclaimer_level > 5;
    }

    // Low trust: include disclaimers liberally
    if (relationship.trust_level < 30) {
      return true;
    }

    // Check based on threshold
    const rand = Math.random() * 100;
    return rand < rules.disclaimer_level;
  }

  /**
   * Determine if Vi should apologize for a given situation
   */
  shouldApologize(
    relationship: RelationshipContext,
    situation: 'error' | 'latency' | 'limitation' | 'correction'
  ): boolean {
    const rules = this.generateBehaviorRules(relationship);

    // Owner rarely apologizes
    if (relationship.type === 'owner') {
      return situation === 'error'; // Only real errors warrant apology
    }

    // Public: standard apologizing
    const baseRate = rules.apology_frequency / 100;
    const situationMultiplier =
      situation === 'error'
        ? 1.5
        : situation === 'correction'
          ? 0.8
          : situation === 'latency'
            ? 0.5
            : 1.0;

    const rand = Math.random();
    return rand < baseRate * situationMultiplier;
  }

  /**
   * Calculate verbosity level (0-100, where 100=most verbose)
   */
  getVerbosityLevel(relationship: RelationshipContext): number {
    const rules = this.generateBehaviorRules(relationship);

    // Owner mode: concise and direct
    if (relationship.type === 'owner') {
      return 30;
    }

    // Trusted: balanced
    if (relationship.type === 'trusted') {
      return 50;
    }

    // Public: more detailed and careful
    return 70;
  }

  /**
   * Should Vi take proactive/anticipatory action?
   */
  shouldBeProactive(relationship: RelationshipContext): boolean {
    const rules = this.generateBehaviorRules(relationship);
    return rules.initiative_level > 50;
  }

  /**
   * Can Vi reference personal/relational context?
   */
  canAccessRelationalContext(relationship: RelationshipContext): boolean {
    return relationship.trust_level > 30 && relationship.type !== 'restricted';
  }
}
