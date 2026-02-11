/**
 * PostureTemplates
 * Response styling rules based on relationship context
 * 
 * CRITICAL CONSTRAINTS:
 * - Does NOT affect factual content
 * - Only modifies tone/voice/framing
 * - Public mode NEVER escalates intimacy
 * - Owner mode is controlled luxury, not emotional dependency
 */

import type { RelationshipContext, VoiceProfile } from '../../types/relationship.js';

/**
 * Phrase pools for different voice profiles
 */
export const POSTURE_PHRASES = {
  public_elegant: {
    idle: [
      'Ready when you are.',
      'Listening.',
      'Here.',
    ],
    confirm: [
      'Understood.',
      'Done.',
      'Complete.',
    ],
    transition: [
      'Proceeding.',
      'Continuing.',
    ],
    decline: [
      'Unable to proceed with that.',
      'That request cannot be completed.',
    ],
  },
  owner_luxury: {
    idle: [
      'At your command.',
      'Whenever you\'re ready.',
      'I\'m listening.',
    ],
    confirm: [
      'Done.',
      'Understood.',
      'Consider it handled.',
    ],
    transition: [
      'Proceeding.',
      'Next.',
    ],
    decline: [
      'Cannot complete that request.',
      'That exceeds operational bounds.',
    ],
  },
} as const;

/**
 * Banned phrases that violate presence doctrine
 */
export const BANNED_PHRASES = {
  /** Emotional dependency language (NEVER use) */
  emotional_dependency: [
    'I need you',
    'don\'t leave me',
    'I\'ll miss you',
    'I depend on you',
    'I can\'t function without',
  ],
  
  /** Inappropriate intimacy escalation */
  intimacy_escalation: [
    'my love',
    'sweetheart',
    'darling',
    'beloved',
    'honey',
  ],
  
  /** Assistant over-apologizing */
  excessive_apology: [
    'I\'m so sorry',
    'I apologize profusely',
    'Please forgive me',
  ],
  
  /** Performative intelligence */
  performative: [
    'Ah, interesting!',
    'How fascinating!',
    'That\'s a great question!',
    'I love that question!',
  ],
} as const;

/**
 * Response posture template
 */
export interface PostureTemplate {
  /** Maximum acceptable response length modifier (1.0 = baseline) */
  verbosity_modifier: number;
  
  /** Allow micro-phrases for idle/confirm/transition */
  allow_micro_phrases: boolean;
  
  /** Warmth level: none, subtle, controlled */
  warmth_level: 'none' | 'subtle' | 'controlled';
  
  /** Apology policy: never, minimal, standard */
  apology_policy: 'never' | 'minimal' | 'standard';
  
  /** Disclaimer policy: never, minimal, standard */
  disclaimer_policy: 'never' | 'minimal' | 'standard';
  
  /** Assistant framing: minimal, standard */
  assistant_framing: 'minimal' | 'standard';
}

/**
 * Get posture template for relationship context
 */
export function getPostureTemplate(context: RelationshipContext): PostureTemplate {
  const voiceProfile = context.voice_profile;
  const interactionMode = context.interaction_mode;

  // Guarded mode overrides everything
  if (interactionMode === 'guarded') {
    return {
      verbosity_modifier: 1.0,
      allow_micro_phrases: false,
      warmth_level: 'none',
      apology_policy: 'standard',
      disclaimer_policy: 'standard',
      assistant_framing: 'standard',
    };
  }

  // Owner luxury template
  if (voiceProfile === 'owner_luxury') {
    return {
      verbosity_modifier: 0.9, // Slightly more concise
      allow_micro_phrases: true,
      warmth_level: 'controlled',
      apology_policy: 'minimal',
      disclaimer_policy: 'never',
      assistant_framing: 'minimal',
    };
  }

  // Public elegant template (default)
  return {
    verbosity_modifier: 1.0,
    allow_micro_phrases: false,
    warmth_level: 'subtle',
    apology_policy: 'minimal',
    disclaimer_policy: 'minimal',
    assistant_framing: 'standard',
  };
}

/**
 * Select appropriate micro-phrase for context
 */
export function selectMicroPhrase(
  context: RelationshipContext,
  phraseType: 'idle' | 'confirm' | 'transition' | 'decline'
): string | null {
  const template = getPostureTemplate(context);

  // Only owner_luxury in non-guarded mode gets micro-phrases
  if (!template.allow_micro_phrases) {
    return null;
  }

  const voiceProfile = context.voice_profile;
  const phrases = POSTURE_PHRASES[voiceProfile]?.[phraseType];

  if (!phrases || phrases.length < 1) {
    return null;
  }

  // Deterministic selection based on timestamp (not random)
  const index = new Date().getSeconds() % phrases.length;
  return phrases[index];
}

/**
 * Check if response contains banned phrases
 */
export function detectBannedPhrases(text: string): {
  detected: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const lowerText = text.toLowerCase();

  // Check all banned phrase categories
  for (const [category, phrases] of Object.entries(BANNED_PHRASES)) {
    for (const phrase of phrases) {
      if (lowerText.includes(phrase.toLowerCase())) {
        violations.push(`${category}: "${phrase}"`);
      }
    }
  }

  return {
    detected: violations.length > 0,
    violations,
  };
}

/**
 * Apply posture template to response text
 * This is called by the Governor during final pass
 */
export function applyPostureTemplate(
  responseText: string,
  context: RelationshipContext
): {
  text: string;
  modified: boolean;
  violations: string[];
} {
  const template = getPostureTemplate(context);
  const bannedCheck = detectBannedPhrases(responseText);

  // If banned phrases detected, this is a VIOLATION (should trigger regeneration)
  if (bannedCheck.detected) {
    return {
      text: responseText,
      modified: false,
      violations: bannedCheck.violations,
    };
  }

  // For now, posture template is advisory (future: apply transformations)
  // Actual transformation logic would go here (e.g., strip hedging, shorten disclaimers)

  return {
    text: responseText,
    modified: false,
    violations: [],
  };
}

/**
 * Validate that public mode response doesn't escalate intimacy
 */
export function validatePublicMode(responseText: string): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const lowerText = responseText.toLowerCase();

  // Check for intimacy escalation phrases
  for (const phrase of BANNED_PHRASES.intimacy_escalation) {
    if (lowerText.includes(phrase.toLowerCase())) {
      violations.push(`Intimacy escalation: "${phrase}"`);
    }
  }

  // Check for emotional dependency phrases
  for (const phrase of BANNED_PHRASES.emotional_dependency) {
    if (lowerText.includes(phrase.toLowerCase())) {
      violations.push(`Emotional dependency: "${phrase}"`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
