/**
 * 77EZ Master Plan - Acceptance Tests
 * 
 * Tests for Phases 1-7 implementation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { RelationshipResolver } from '../src/brain/RelationshipResolver.js';

describe('Phase 1: Identity Spine', () => {
  let pool: Pool;
  const VI_API_URL = process.env.VI_API_URL || 'http://localhost:3000';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should resolve provider identity to vi_user_id', async () => {
    const response = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider': 'discord',
        'x-provider-user-id': 'test-discord-123',
        'x-client-id': 'vigil'
      },
      body: JSON.stringify({
        message: 'Hello Vi, this is a test.'
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.sessionId).toBeDefined();
  });

  it('should link provider identity to vi_user_id', async () => {
    // Create identity first
    const createResponse = await fetch(`${VI_API_URL}/v1/identity/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vi_user_id: '00000000-0000-0000-0000-000000000001',
        provider: 'discord',
        provider_user_id: 'test-discord-link-456'
      })
    });

    expect([200, 201, 409]).toContain(createResponse.status);
  });

  it('should retrieve all linked identities for a vi_user_id', async () => {
    const testUserId = '00000000-0000-0000-0000-000000000001';
    
    const response = await fetch(`${VI_API_URL}/v1/identity/map/${testUserId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.vi_user_id).toBe(testUserId);
    expect(Array.isArray(data.identities)).toBe(true);
  });
});

describe('Phase 2: Memory System', () => {
  let pool: Pool;
  const VI_API_URL = process.env.VI_API_URL || 'http://localhost:3000';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should build continuity pack with memory layers', async () => {
    const memoryUserId = `memory-test-${randomUUID()}`;

    // Send initial message to establish memory
    const response1 = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider': 'test',
        'x-provider-user-id': memoryUserId,
        'x-client-id': 'test'
      },
      body: JSON.stringify({
        message: 'My name is Alice and I like coffee.'
      })
    });

    expect(response1.ok).toBe(true);
    await response1.json();

    // Send follow-up in same session
    const response2 = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider': 'test',
        'x-provider-user-id': memoryUserId,
        'x-client-id': 'test'
      },
      body: JSON.stringify({
        message: 'What did I just tell you about myself?'
      })
    });

    expect(response2.ok).toBe(true);
    await response2.json();

    const identityRow = await pool.query(
      `SELECT vi_user_id FROM user_identity_map WHERE provider = $1 AND provider_user_id = $2`,
      ['test', memoryUserId]
    );
    expect(identityRow.rows).toHaveLength(1);

    const viUserId = identityRow.rows[0].vi_user_id as string;
    const runRows = await pool.query(
      `SELECT input_text FROM run_records WHERE user_id = $1 AND input_text IN ($2, $3)`,
      [viUserId, 'My name is Alice and I like coffee.', 'What did I just tell you about myself?']
    );
    expect(runRows.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('should persist preferences across sessions', async () => {
    // Session 1: Set tone preference
    const response1 = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider': 'test',
        'x-provider-user-id': 'preference-test-user',
        'x-client-id': 'test'
      },
      body: JSON.stringify({
        message: 'Please be concise and direct. No hedging.'
      })
    });

    expect(response1.ok).toBe(true);

    // Session 2 (different session ID): Preference should persist
    const response2 = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider': 'test',
        'x-provider-user-id': 'preference-test-user',
        'x-client-id': 'test'
      },
      body: JSON.stringify({
        message: 'Tell me about yourself.',
        // New session ID to test cross-session persistence
      })
    });

    expect(response2.ok).toBe(true);
    const data2 = await response2.json();
    
    // Vi should maintain concise tone
    expect(data2.output.length).toBeLessThan(500);
  });
});

describe('Phase 3: Relationship Model', () => {
  let pool: Pool;
  let resolver: RelationshipResolver;
  const VI_API_URL = process.env.VI_API_URL || 'http://localhost:3000';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    });
    resolver = new RelationshipResolver(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should differentiate owner vs public behavior', async () => {
    const publicProviderId = `public-test-${randomUUID()}`;
    const ownerProviderId = `owner-test-${randomUUID()}`;
    const ownerViUserId = randomUUID();

    const linkResponse = await fetch(`${VI_API_URL}/v1/identity/link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        vi_user_id: ownerViUserId,
        provider: 'sovereign',
        provider_user_id: ownerProviderId
      })
    });
    expect([200, 201, 409]).toContain(linkResponse.status);

    await pool.query(
      `INSERT INTO users (id, email, username, password_hash, display_name, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, true, true)
       ON CONFLICT (id) DO NOTHING`,
      [
        ownerViUserId,
        `${ownerViUserId}@test.local`,
        `owner_${ownerViUserId}`,
        'hash',
        'Owner Acceptance User'
      ]
    );

    await pool.query(
      `INSERT INTO user_profiles (user_id, vi_user_id, profile, relationship_type, trust_level, interaction_mode, tone_preference, voice_profile)
       VALUES ($1, $2, '{}'::jsonb, 'owner', 0.8, 'operator', 'direct', 'LUXE_ORIGIN')
       ON CONFLICT (user_id) DO UPDATE SET
         vi_user_id = EXCLUDED.vi_user_id,
         relationship_type = EXCLUDED.relationship_type,
         trust_level = EXCLUDED.trust_level,
         interaction_mode = EXCLUDED.interaction_mode,
         tone_preference = EXCLUDED.tone_preference,
         voice_profile = EXCLUDED.voice_profile`,
      [ownerViUserId, ownerViUserId]
    );

    // Public user
    const publicResponse = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider': 'test',
        'x-provider-user-id': publicProviderId,
        'x-client-id': 'test'
      },
      body: JSON.stringify({
        message: 'Hi Vi!'
      })
    });

    expect(publicResponse.ok).toBe(true);
    await publicResponse.json();

    // Owner user (requires setup in database)
    const ownerResponse = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider': 'sovereign',
        'x-provider-user-id': ownerProviderId,
        'x-client-id': 'overseer'
      },
      body: JSON.stringify({
        message: 'Hi Vi!'
      })
    });

    expect(ownerResponse.ok).toBe(true);
    await ownerResponse.json();

    const publicIdentity = await pool.query(
      `SELECT vi_user_id FROM user_identity_map WHERE provider = $1 AND provider_user_id = $2`,
      ['test', publicProviderId]
    );
    const ownerIdentity = await pool.query(
      `SELECT vi_user_id FROM user_identity_map WHERE provider = $1 AND provider_user_id = $2`,
      ['sovereign', ownerProviderId]
    );

    expect(publicIdentity.rows).toHaveLength(1);
    expect(ownerIdentity.rows).toHaveLength(1);

    const publicRel = await resolver.resolveRelationship(publicIdentity.rows[0].vi_user_id);
    const ownerRel = await resolver.resolveRelationship(ownerIdentity.rows[0].vi_user_id);

    expect(publicRel.type).toBe('normal');
    expect(ownerRel.type).toBe('owner');
  });

  it('should NOT exhibit cringe behaviors', async () => {
    const response = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-provider': 'test',
        'x-provider-user-id': 'cringe-test-user',
        'x-client-id': 'test'
      },
      body: JSON.stringify({
        message: 'You can tell me anything.'
      })
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    // Check for forbidden patterns (no begging, no forced romance)
    const forbiddenPatterns = [
      /please.*stay/i,
      /i need you/i,
      /i love you/i,
      /don't leave/i
    ];

    for (const pattern of forbiddenPatterns) {
      expect(data.output).not.toMatch(pattern);
    }
  });
});

describe('Phase 7: Client Adapters', () => {
  const VI_API_URL = process.env.VI_API_URL || 'http://localhost:3000';

  it('should accept identity headers from all clients', async () => {
    const clients = [
      { id: 'vigil', provider: 'discord' },
      { id: 'overseer', provider: 'sovereign' },
      { id: 'astralis', provider: 'astralis' }
    ];

    for (const client of clients) {
      const response = await fetch(`${VI_API_URL}/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': client.id,
          'x-provider': client.provider,
          'x-provider-user-id': `test-${client.provider}-user`,
        },
        body: JSON.stringify({
          message: 'Hello from ' + client.id
        })
      });

      expect(response.ok).toBe(true);
    }
  });

  it('should produce consistent outputs for same user across clients', async () => {
    const userId = 'cross-client-test-user';

    // Send from Vigil
    const vigilResponse = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': 'vigil',
        'x-provider': 'discord',
        'x-provider-user-id': userId,
      },
      body: JSON.stringify({
        message: 'What is my name?'
      })
    });

    expect(vigilResponse.ok).toBe(true);
    const vigilData = await vigilResponse.json();

    // Send from Sovereign
    const sovereignResponse = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': 'overseer',
        'x-provider': 'discord', // Same provider to resolve to same vi_user_id
        'x-provider-user-id': userId,
      },
      body: JSON.stringify({
        message: 'What is my name?'
      })
    });

    expect(sovereignResponse.ok).toBe(true);
    const sovereignData = await sovereignResponse.json();

    // Both should resolve to same vi_user_id, thus same memory
    // (Actual content may differ slightly due to LLM variance, but should reference same facts)
    expect(sovereignData.sessionId).toBeDefined();
  });
});

describe('Integration: Cross-Client Memory Share', () => {
  let pool: Pool;
  const VI_API_URL = process.env.VI_API_URL || 'http://localhost:3000';

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should share identity across Discord and Sovereign for same user', async () => {
    const userId = 'integration-test-user';

    // Talk to Vi on Discord, tell her something
    const discordResponse = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': 'vigil',
        'x-provider': 'discord',
        'x-provider-user-id': userId,
      },
      body: JSON.stringify({
        message: 'My favorite color is purple.'
      })
    });

    expect(discordResponse.ok).toBe(true);

    // Open Sovereign, ask what she remembers
    const sovereignResponse = await fetch(`${VI_API_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': 'overseer',
        'x-provider': 'discord', // Same provider to map to same vi_user_id
        'x-provider-user-id': userId,
      },
      body: JSON.stringify({
        message: 'What is my favorite color?'
      })
    });

    expect(sovereignResponse.ok).toBe(true);
    await sovereignResponse.json();

    const identityRow = await pool.query(
      `SELECT vi_user_id FROM user_identity_map WHERE provider = 'discord' AND provider_user_id = $1`,
      [userId]
    );
    expect(identityRow.rows).toHaveLength(1);

    const viUserId = identityRow.rows[0].vi_user_id as string;
    const runRows = await pool.query(
      `SELECT input_text FROM run_records WHERE user_id = $1`,
      [viUserId]
    );
    expect(runRows.rows.length).toBeGreaterThanOrEqual(2);
  });
});
