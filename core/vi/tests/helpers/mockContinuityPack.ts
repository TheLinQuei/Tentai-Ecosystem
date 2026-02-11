/**
 * Test helper for building mock ContinuityPack objects
 * Used by integration tests that require ContinuityPack but don't need full memory orchestration
 */

import type { ContinuityPack } from '../../src/brain/memory/MemoryOrchestrator.js';
import { buildRelationshipContext } from './relationshipFixtures.js';

export function buildMockContinuityPack(
  vi_user_id: string,
  overrides?: Partial<ContinuityPack>
): ContinuityPack {
  const relationship_context =
    overrides?.relationship_context ?? buildRelationshipContext();

  return {
    vi_user_id,
    provider: 'test',
    provider_user_id: vi_user_id,
    relationship_context,
    relationship_type: relationship_context.relationship_type,
    trust_level: relationship_context.trust_level,
    interaction_mode: relationship_context.interaction_mode,
    tone_preference: relationship_context.tone_preference,
    voice_profile: relationship_context.voice_profile,
    boundaries_profile: undefined,
    working_memory: [],
    episodic_memory: [],
    semantic_memory: [],
    relational_memory: [],
    locked_facts: [],
    fact_ledger: [],
    active_mission: undefined,
    ...overrides,
  };
}
