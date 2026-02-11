/**
 * Relationship Model Types
 * Phase 2: Owner vs Public behavioral posture
 * 
 * CONSTRAINTS:
 * - Deterministic, no ML-based inference
 * - Default is always 'public'
 * - Only explicit promotion to 'owner' allowed
 * - Does NOT affect factual correctness, only tone/voice/posture
 */

export type RelationshipType = 'owner' | 'public';

export type TonePreference = 'neutral' | 'direct' | 'warm' | 'formal';

export type VoiceProfile = 'public_elegant' | 'owner_luxury';

export type InteractionMode = 'default' | 'guarded';

/**
 * RelationshipContext
 * Computed deterministically from:
 * 1. Locked facts (highest authority)
 * 2. Database user_relationships table
 * 3. Safety defaults (public)
 */
export interface RelationshipContext {
  /** Owner or public mode - determines behavioral posture */
  relationship_type: RelationshipType;
  
  /** Operational trust score 0-100 */
  trust_level: number;
  
  /** Preferred tone style */
  tone_preference: TonePreference;
  
  /** Determines phrase pool and presence style */
  voice_profile: VoiceProfile;
  
  /** Guarded mode forces public_elegant regardless of relationship_type */
  interaction_mode: InteractionMode;
  
  /** ISO timestamp when context was computed */
  computed_at: string;
  
  /** Source of relationship data for auditability */
  source: 'db_default' | 'db' | 'locked_fact';
}

/**
 * Database row shape for user_relationships table
 */
export interface UserRelationshipRow {
  vi_user_id: string;
  relationship_type: RelationshipType;
  trust_level: number;
  tone_preference: TonePreference;
  voice_profile: VoiceProfile;
  interaction_mode: InteractionMode;
  created_at: Date;
  updated_at: Date;
}

/**
 * Safe defaults for new users
 */
export const DEFAULT_RELATIONSHIP_CONTEXT: Omit<RelationshipContext, 'computed_at' | 'source'> = {
  relationship_type: 'public',
  trust_level: 0,
  tone_preference: 'neutral',
  voice_profile: 'public_elegant',
  interaction_mode: 'default',
};

/**
 * Validation: ensure trust_level is within bounds
 */
export function validateTrustLevel(level: number): number {
  return Math.max(0, Math.min(100, Math.floor(level)));
}

/**
 * Type guard for RelationshipType
 */
export function isRelationshipType(value: unknown): value is RelationshipType {
  return value === 'owner' || value === 'public';
}

/**
 * Type guard for VoiceProfile
 */
export function isVoiceProfile(value: unknown): value is VoiceProfile {
  return value === 'public_elegant' || value === 'owner_luxury';
}
