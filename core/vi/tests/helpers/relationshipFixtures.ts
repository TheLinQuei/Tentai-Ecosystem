import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  DEFAULT_RELATIONSHIP_CONTEXT,
  validateTrustLevel,
  type RelationshipContext,
  type RelationshipType,
  type InteractionMode,
  type VoiceProfile,
  type TonePreference,
} from '../../src/types/relationship.js';

export interface TestIdentityOptions {
  vi_user_id?: string;
  provider?: string;
  provider_user_id?: string;
  metadata?: Record<string, unknown>;
}

export interface RelationshipOverrides {
  relationship_type?: RelationshipType;
  trust_level?: number;
  tone_preference?: TonePreference;
  voice_profile?: VoiceProfile;
  interaction_mode?: InteractionMode;
  source?: RelationshipContext['source'];
  computed_at?: string;
}

export const PUBLIC_RELATIONSHIP_DEFAULTS: Omit<RelationshipContext, 'computed_at' | 'source'> = {
  ...DEFAULT_RELATIONSHIP_CONTEXT,
};

export const OWNER_RELATIONSHIP_OVERRIDES: RelationshipOverrides = {
  relationship_type: 'owner',
  trust_level: 80,
  tone_preference: 'direct',
  voice_profile: 'owner_luxury',
};

export const GUARDED_RELATIONSHIP_OVERRIDES: RelationshipOverrides = {
  interaction_mode: 'guarded',
  relationship_type: 'public',
  trust_level: 0,
  tone_preference: 'neutral',
  voice_profile: 'public_elegant',
};

export function buildRelationshipContext(
  overrides: RelationshipOverrides = {},
  defaults: Omit<RelationshipContext, 'computed_at' | 'source'> = PUBLIC_RELATIONSHIP_DEFAULTS
): RelationshipContext {
  const trustLevel = validateTrustLevel(
    overrides.trust_level ?? defaults.trust_level
  );

  return {
    relationship_type: overrides.relationship_type ?? defaults.relationship_type,
    trust_level: trustLevel,
    tone_preference: overrides.tone_preference ?? defaults.tone_preference,
    voice_profile: overrides.voice_profile ?? defaults.voice_profile,
    interaction_mode: overrides.interaction_mode ?? defaults.interaction_mode,
    computed_at: overrides.computed_at ?? new Date().toISOString(),
    source: overrides.source ?? 'db_default',
  };
}

export async function provisionIdentityRow(
  pool: Pool,
  options: TestIdentityOptions = {}
): Promise<string> {
  const vi_user_id = options.vi_user_id ?? randomUUID();
  const provider = options.provider ?? 'test';
  const provider_user_id = options.provider_user_id ?? `${provider}-${vi_user_id}`;
  const metadata = options.metadata ?? {};

  await pool.query(
    `INSERT INTO user_identity_map (vi_user_id, provider, provider_user_id, metadata)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (provider, provider_user_id) DO NOTHING`,
    [vi_user_id, provider, provider_user_id, JSON.stringify(metadata)]
  );

  return vi_user_id;
}

export async function provisionRelationshipRow(
  pool: Pool,
  vi_user_id: string,
  overrides: RelationshipOverrides = {}
): Promise<RelationshipContext> {
  const context = buildRelationshipContext({
    ...overrides,
    source: overrides.source ?? 'db',
  });

  await pool.query(
    `INSERT INTO user_relationships (
      vi_user_id,
      relationship_type,
      trust_level,
      tone_preference,
      voice_profile,
      interaction_mode
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (vi_user_id) DO UPDATE SET
      relationship_type = EXCLUDED.relationship_type,
      trust_level = EXCLUDED.trust_level,
      tone_preference = EXCLUDED.tone_preference,
      voice_profile = EXCLUDED.voice_profile,
      interaction_mode = EXCLUDED.interaction_mode,
      updated_at = NOW()`,
    [
      vi_user_id,
      context.relationship_type,
      context.trust_level,
      context.tone_preference,
      context.voice_profile,
      context.interaction_mode,
    ]
  );

  return context;
}

export async function provisionTestUserWithRelationship(
  pool: Pool,
  options: TestIdentityOptions & { relationship?: RelationshipOverrides } = {}
): Promise<{ vi_user_id: string; relationship: RelationshipContext }> {
  const vi_user_id = await provisionIdentityRow(pool, options);
  const relationship = await provisionRelationshipRow(
    pool,
    vi_user_id,
    options.relationship
  );

  return { vi_user_id, relationship };
}
