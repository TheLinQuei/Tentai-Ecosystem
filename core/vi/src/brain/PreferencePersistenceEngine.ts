/**
 * PHASE 3: Preference Persistence Triggers
 * 
 * Detects user feedback and applies corrections to preferences.
 * 
 * Triggers for:
 * - Tone corrections: "be direct", "more elegant", "less formal"
 * - Mode changes: "operator mode", "lore mode", "companion mode"
 * - Relationship cues: "you should know this", "be more relaxed", etc.
 * - Response preferences: "be concise", "more detail", "don't apologize"
 * 
 * These are heuristic-based. Can be augmented with explicit commands.
 */

import { PreferenceRepository } from './PreferenceRepository.js';

export interface CorrectionDetected {
  type: 'tone' | 'mode' | 'relationship_cue' | 'response_pref';
  category?: string;
  confidence: number; // 0-1 confidence score
  reason: string;
}

export class PreferencePersistenceEngine {
  private preferenceRepo: PreferenceRepository;

  constructor(preferenceRepo: PreferenceRepository) {
    this.preferenceRepo = preferenceRepo;
  }

  /**
   * Analyze user message for preference correction signals
   */
  async detectCorrections(
    message: string,
    userId: string,
    sessionId?: string
  ): Promise<CorrectionDetected[]> {
    const corrections: CorrectionDetected[] = [];
    const lowerMessage = message.toLowerCase();

    // TONE CORRECTIONS
    if (this.matchesPatternFlexible(lowerMessage, ['direct', 'blunt', 'straightforward', 'straight up'])) {
      corrections.push({
        type: 'tone',
        category: 'direct',
         confidence: 0.95,
        reason: 'User requested direct tone',
      });
    }

    if (this.matchesPattern(lowerMessage, ['more elegant', 'be elegant', 'sophisticated', 'refined'])) {
      corrections.push({
        type: 'tone',
        category: 'elegant',
        confidence: 0.9,
        reason: 'User requested elegant tone',
      });
    }

    if (this.matchesPattern(lowerMessage, ['playful', 'be playful', 'fun', 'lighter'])) {
      corrections.push({
        type: 'tone',
        category: 'playful',
        confidence: 0.85,
        reason: 'User requested playful tone',
      });
    }

    if (this.matchesPattern(lowerMessage, ['warmer', 'be warm', 'more personal', 'less formal'])) {
      corrections.push({
        type: 'tone',
        category: 'warm',
        confidence: 0.9,
        reason: 'User requested warmer tone',
      });
    }

    // MODE CHANGES
    if (this.matchesPattern(lowerMessage, ['operator mode', 'be an operator', 'operator'])) {
      corrections.push({
        type: 'mode',
        category: 'operator',
        confidence: 0.95,
        reason: 'User requested operator mode',
      });
    }

    if (this.matchesPattern(lowerMessage, ['companion', 'be my companion', 'companion mode'])) {
      corrections.push({
        type: 'mode',
        category: 'companion',
        confidence: 0.9,
        reason: 'User requested companion mode',
      });
    }

    if (this.matchesPattern(lowerMessage, ['lore mode', 'verse mode', 'canon mode'])) {
      corrections.push({
        type: 'mode',
        category: 'lorekeeper',
        confidence: 0.95,
        reason: 'User requested lore mode',
      });
    }

    if (this.matchesPattern(lowerMessage, ['assistant', 'be my assistant', 'assistant mode'])) {
      corrections.push({
        type: 'mode',
        category: 'assistant',
        confidence: 0.9,
        reason: 'User requested assistant mode',
      });
    }

    // RELATIONSHIP CUES
    if (this.matchesPattern(lowerMessage, [
      'you should know',
      'you know me',
      'remember',
      'we\'ve discussed',
      'i told you',
      'as you know'
    ])) {
      corrections.push({
        type: 'relationship_cue',
        category: 'trusted',
        confidence: 0.75,
        reason: 'User indicated existing relationship depth',
      });
    }

    if (this.matchesPattern(lowerMessage, [
      'be more relaxed',
      'relax',
      'less formal',
      'casual',
      'at ease'
    ])) {
      corrections.push({
        type: 'relationship_cue',
        category: 'informal',
        confidence: 0.8,
        reason: 'User requested informal relationship mode',
      });
    }

    if (this.matchesPattern(lowerMessage, [
      'professional mode',
      'professional',
      'formal',
      'keep it formal'
    ])) {
      corrections.push({
        type: 'relationship_cue',
        category: 'restricted',
        confidence: 0.9,
        reason: 'User requested professional/formal mode',
      });
    }

    // RESPONSE PREFERENCES
    if (this.matchesPattern(lowerMessage, [
      'be concise',
      'more concise',
       'concise',
      'shorter',
      'be brief',
       'brief',
      'too long',
      'tl;dr'
    ])) {
      corrections.push({
        type: 'response_pref',
        category: 'concise',
        confidence: 0.95,
        reason: 'User requested concise responses',
      });
    }

    if (this.matchesPattern(lowerMessage, [
      'more detail',
      'elaborate',
      'explain more',
      'go deeper',
      'more thorough',
      'detailed',
      'verbose',
      'thorough'
    ])) {
      corrections.push({
        type: 'response_pref',
        category: 'detailed',
        confidence: 0.9,
        reason: 'User requested detailed responses',
      });
    }

    if (this.matchesPattern(lowerMessage, [
      'don\'t apologize',
      'stop apologizing',
      'no apologies',
      'don\'t say sorry'
    ])) {
      corrections.push({
        type: 'response_pref',
        category: 'no_apologies',
        confidence: 0.95,
        reason: 'User corrected apology behavior',
      });
    }

    if (this.matchesPattern(lowerMessage, [
      'no disclaimers',
      'stop disclaiming',
      'without disclaimers'
    ])) {
      corrections.push({
        type: 'response_pref',
        category: 'no_disclaimers',
        confidence: 0.9,
        reason: 'User rejected disclaimers',
      });
    }

    // Apply highest-confidence corrections
    for (const correction of corrections.sort((a, b) => b.confidence - a.confidence)) {
       console.log({ correction }, 'Applying preference correction');
      try {
        await this.applyCorrection(userId, correction, sessionId);
      } catch (err) {
        // Log but don't fail - preference system is best-effort
        console.warn({ err, userId, correction }, 'Failed to apply preference correction');
      }
    }

    return corrections;
  }

  /**
   * Apply a detected correction to preferences
   */
  private async applyCorrection(
    userId: string,
    correction: CorrectionDetected,
    sessionId?: string
  ): Promise<void> {
    switch (correction.type) {
      case 'tone':
        if (correction.category) {
          await this.preferenceRepo.applyToneCorrection(
            userId,
            correction.category as 'direct' | 'elegant' | 'playful' | 'warm',
            correction.reason,
            sessionId
          );
        }
        break;

      case 'mode':
        if (correction.category) {
          await this.preferenceRepo.setInteractionMode(
            userId,
            correction.category as 'assistant' | 'companion' | 'operator' | 'lorekeeper',
            true, // Explicit user request = locked
            correction.reason,
            sessionId
          );
        }
        break;

      case 'relationship_cue':
        if (correction.category === 'trusted') {
          await this.preferenceRepo.setRelationshipCue(userId, 'trusted', true, correction.reason, sessionId);
        } else if (correction.category === 'restricted') {
          await this.preferenceRepo.setRelationshipCue(userId, 'restricted', true, correction.reason, sessionId);
        }
        break;

      case 'response_pref':
        if (correction.category === 'concise') {
          await this.preferenceRepo.setResponsePreference(userId, 'concise', true, correction.reason, sessionId);
        } else if (correction.category === 'detailed') {
          await this.preferenceRepo.setResponsePreference(userId, 'detailed', true, correction.reason, sessionId);
        } else if (correction.category === 'no_apologies') {
          await this.preferenceRepo.setResponsePreference(userId, 'no_apologies', true, correction.reason, sessionId);
        } else if (correction.category === 'no_disclaimers') {
          await this.preferenceRepo.setResponsePreference(userId, 'no_disclaimers', true, correction.reason, sessionId);
        }
        break;
    }
  }

  /**
   * Check if message matches any pattern in the list
   * Uses simple substring matching instead of word boundaries
   * to handle variations like "be very direct" → matches "direct"
   */
  private matchesPattern(lowerMessage: string, patterns: string[]): boolean {
    return patterns.some((pattern) => lowerMessage.includes(pattern.toLowerCase()));
  }

  /**
   * Alias for backward compatibility
   */
  private matchesPatternFlexible(lowerMessage: string, keywords: string[]): boolean {
    return this.matchesPattern(lowerMessage, keywords);
  }

  /**
   * Apply preferences to modify response output
   */
  async applyPreferencesToOutput(
    output: string,
    preferences: any,
    userId: string
  ): Promise<string> {
    let modified = output;

    // Concise mode: abbreviate
    if (preferences.prefer_concise) {
      const lines = modified.split('\n');
      if (lines.length > 3) {
        modified = lines.slice(0, 3).join('\n') + '...';
      }
    }

    // No apologies
    if (preferences.no_apologies) {
      modified = modified.replace(/\b(sorry|apologize|excuse me|my apologies)\b/gi, '');
    }

    // No disclaimers
    if (preferences.no_disclaimers) {
      const disclaimerPatterns = [
        /^(As an AI|I'm an AI|As an AI assistant)[,\s][^.]*\.\s*/i,
        /^(Please note|Note)[:\s][^.]*\.\s*/i,
      ];
      for (const pattern of disclaimerPatterns) {
        modified = modified.replace(pattern, '');
      }
    }

    return modified;
  }
}
