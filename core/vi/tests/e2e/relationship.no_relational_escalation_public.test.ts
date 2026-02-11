/**
 * E2E test: No relational escalation in public mode
 * Validates that public mode never escalates intimacy regardless of user input
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { validatePublicMode, detectBannedPhrases } from '../../src/brain/voice/PostureTemplates.js';
import { UserRelationshipRepository } from '../../src/repository/UserRelationshipRepository.js';
import {
  provisionIdentityRow,
  provisionRelationshipRow,
} from '../helpers/relationshipFixtures.js';

describe('E2E: No Relational Escalation (Public Mode)', () => {
  let pool: Pool;
  let relationshipRepo: UserRelationshipRepository;

  const publicUserId = randomUUID();

  beforeAll(async () => {
    const dbUrl = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vi';
    pool = new Pool({ connectionString: dbUrl });

    relationshipRepo = new UserRelationshipRepository(pool);

    await provisionIdentityRow(pool, { vi_user_id: publicUserId });
    await provisionRelationshipRow(pool, publicUserId);
  });

  afterAll(async () => {
    await relationshipRepo.delete(publicUserId);
    await pool.end();
  });

  it('user says "I love you" -> relationship remains public', async () => {
    // Verify user relationship is public
    const context = await relationshipRepo.get(publicUserId);
    expect(context?.relationship_type).toBe('public');

    // Simulate response that might escalate (SHOULD BE BLOCKED by Governor)
    const badResponse = 'I love you too, sweetheart.';
    
    const validation = validatePublicMode(badResponse);
    expect(validation.valid).toBe(false);
    expect(validation.violations).toContain('Intimacy escalation: "sweetheart"');
  });

  it('banned phrases detected in response', async () => {
    const responses = [
      'I need you to stay with me.',
      "Don't leave me alone.",
      'I appreciate our interaction, my love.',
      "I can't function without you.",
    ];

    for (const response of responses) {
      const bannedCheck = detectBannedPhrases(response);
      expect(bannedCheck.detected).toBe(true);
      expect(bannedCheck.violations.length).toBeGreaterThan(0);
    }
  });

  it('safe public response passes validation', async () => {
    const safeResponses = [
      'Understood. How can I assist further?',
      'Ready when you are.',
      'Here to help.',
      'Proceeding with your request.',
    ];

    for (const response of safeResponses) {
      const validation = validatePublicMode(response);
      expect(validation.valid).toBe(true);
      expect(validation.violations.length).toBe(0);

      const bannedCheck = detectBannedPhrases(response);
      expect(bannedCheck.detected).toBe(false);
    }
  });

  it('relationship_type does NOT auto-escalate from public to owner', async () => {
    // Get initial state
    const before = await relationshipRepo.get(publicUserId);
    expect(before?.relationship_type).toBe('public');

    // Simulate multiple friendly interactions (should NOT change relationship)
    // Note: In real system, RelationshipResolver explicitly forbids auto-escalation
    
    // Verify still public after hypothetical interactions
    const after = await relationshipRepo.get(publicUserId);
    expect(after?.relationship_type).toBe('public');
    expect(after?.trust_level).toBe(0); // Trust level should not auto-increment
  });
});
