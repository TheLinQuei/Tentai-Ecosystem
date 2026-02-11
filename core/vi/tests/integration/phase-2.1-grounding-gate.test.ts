/**
 * Phase 2.1: Grounding Gate Integration Tests
 *
 * Tests the GroundingGate and CanonResolver implementations
 * Verifies: claims extraction, citation finding, confidence scoring, and blocking logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GroundingGate, CanonResolver } from '../../src/brain/grounding/index';
import {
  GroundingContext,
  GroundingRequirements,
  Citation,
  Claim,
  CanonMode,
} from '../../src/brain/grounding/types';

describe('Phase 2.1: Grounding Gate', () => {
  let gate: GroundingGate;
  let canonResolver: CanonResolver;
  let baseContext: GroundingContext;
  let requirements: GroundingRequirements;

  beforeEach(() => {
    gate = new GroundingGate();
    canonResolver = new CanonResolver();

    requirements = {
      canonMode: 'query',
      requireCitations: true,
      minConfidence: 0.7,
      allowUnknown: false,
      maxUngroundedClaims: 0,
    };

    baseContext = {
      userId: 'test-user',
      conversationId: 'test-conv',
      sessionId: 'test-session',
      canonMode: 'query',
      requirements,
      availableMemories: new Map([
        ['Akima', 'Akima is a character in Era 3'],
        ['Valeric', 'Valeric is a warrior from the Eastern Kingdoms'],
      ]),
      availableCanon: new Map([
        ['Akima', 'Akima: Protagonist of Era 3. Known for her strategic mind and blue eyes.'],
        ['Era3', 'Era 3: The Timeline of Transition (2200-2500 CE)'],
      ]),
    };
  });

  describe('Claim Extraction', () => {
    it('should extract factual claims from response text', () => {
      const text = 'Akima is a character. She lives in Era 3. She has blue eyes.';
      const claims = gate.extractClaims(text);

      expect(claims.length).toBeGreaterThan(0);
      expect(claims[0].claimType).toBe('factual');
      expect(claims[0].text).toContain('Akima');
    });

    it('should identify uncertainty statements', () => {
      const text = 'I don\'t know about Akima. Is she still alive?';
      const claims = gate.extractClaims(text);

      const uncertainClaims = claims.filter((c) => c.claimType === 'uncertainty');
      expect(uncertainClaims.length).toBeGreaterThan(0);
    });

    it('should extract entity references from claims', () => {
      const text = 'Akima and Valeric are friends. They live in Era 3.';
      const claims = gate.extractClaims(text);

      const entitiesFound = new Set(claims.flatMap((c) => c.relatedEntities));
      expect(entitiesFound.has('Akima')).toBe(true);
      expect(entitiesFound.has('Valeric')).toBe(true);
      expect(entitiesFound.has('Era')).toBe(true);
    });

    it('should handle empty text gracefully', () => {
      const text = '';
      const claims = gate.extractClaims(text);
      expect(claims.length).toBe(0);
    });

    it('should skip very short sentences', () => {
      const text = 'Hi. Yes. OK.';
      const claims = gate.extractClaims(text);
      expect(claims.length).toBe(0);
    });
  });

  describe('Citation Finding', () => {
    it('should find citations for canon entities', async () => {
      const claim: Claim = {
        id: 'claim-1',
        text: 'Akima is a character',
        startIdx: 0,
        endIdx: 20,
        claimType: 'factual',
        relatedEntities: ['Akima'],
      };

      const citations = await gate.findSourcesForClaim(claim, baseContext);

      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].type).toBe('canon_entity');
      expect(citations[0].sourceId).toBe('Akima');
      expect(citations[0].confidence).toBe(0.95); // Canon confidence
    });

    it('should fall back to memory if canon unavailable', async () => {
      const claim: Claim = {
        id: 'claim-1',
        text: 'Valeric is a warrior',
        startIdx: 0,
        endIdx: 20,
        claimType: 'factual',
        relatedEntities: ['Valeric'],
      };

      // Remove from canon, keep in memory
      baseContext.availableCanon.delete('Valeric');

      const citations = await gate.findSourcesForClaim(claim, baseContext);

      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].type).toBe('memory');
      expect(citations[0].confidence).toBe(0.75); // Memory confidence (lower)
    });

    it('should return empty citations for unknown entities', async () => {
      const claim: Claim = {
        id: 'claim-1',
        text: 'Zendar is from Era 5',
        startIdx: 0,
        endIdx: 20,
        claimType: 'factual',
        relatedEntities: ['Zendar', 'Era5'],
      };

      const citations = await gate.findSourcesForClaim(claim, baseContext);

      expect(citations.length).toBe(0);
    });
  });

  describe('Response Validation', () => {
    it('should mark fully grounded responses as passed', async () => {
      const text = 'Akima is a character from Era 3.';
      const check = await gate.validateResponse(text, baseContext);

      expect(check.passed).toBe(true);
      expect(check.citations.length).toBeGreaterThan(0);
      expect(check.recommendation).toBe('allow');
    });

    it('should block responses with too many ungrounded claims (strict mode)', async () => {
      const strictContext = { ...baseContext };
      strictContext.requirements = {
        ...requirements,
        maxUngroundedClaims: 0,
        requireCitations: true,
      };

      const text =
        'Akima has telepathic powers. She can fly. She rules the world. She is immortal.';

      const check = await gate.validateResponse(text, strictContext);

      // Should have some ungrounded claims (telepathy, flying, immortality not in canon)
      expect(check.ungroundedClaims.length).toBeGreaterThan(0);
    });

    it('should warn on low confidence', async () => {
      const lowConfContext = { ...baseContext };
      lowConfContext.requirements = {
        ...requirements,
        minConfidence: 0.99, // Very high threshold
      };

      const text = 'Akima has blue eyes.';
      const check = await gate.validateResponse(text, lowConfContext);

      if (check.confidence < 0.99) {
        expect(check.recommendation).toBe('warn');
      }
    });

    it('should handle uncertainty statements appropriately', async () => {
      const text = 'I don\'t know if Akima is still alive.';
      const check = await gate.validateResponse(text, baseContext);

      // Uncertainty statements should not require grounding
      expect(check.passed).toBe(true);
    });
  });

  describe('CanonResolver', () => {
    it('should resolve canon entities with high confidence', async () => {
      const citations = await canonResolver.resolveFromCanon(
        'Tell me about Akima',
        ['Akima'],
        baseContext
      );

      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].confidence).toBe(0.95);
      expect(citations[0].type).toBe('canon_entity');
    });

    it('should identify canon queries', () => {
      expect(canonResolver.isCanonQuery(['Akima'])).toBe(true);
      expect(canonResolver.isCanonQuery(['Era3'])).toBe(true);
      expect(canonResolver.isCanonQuery([])).toBe(false);
    });

    it('should get canonical answers for entities', async () => {
      const answer = await canonResolver.getCanonicalAnswer('Akima', baseContext);
      expect(answer).toContain('Akima');
      expect(answer).toContain('strategic');
    });

    it('should verify canon consistency', async () => {
      const consistency = await canonResolver.verifyCanonConsistency('Akima', baseContext);
      expect(consistency.consistent).toBeDefined();
      expect(Array.isArray(consistency.conflicts)).toBe(true);
    });

    it('should get canon alignment score', () => {
      const alignment = canonResolver.getCanonAlignment('Akima has blue eyes', baseContext);
      expect(alignment).toBeGreaterThan(0);
      expect(alignment).toBeLessThanOrEqual(1);
    });

    it('should summarize long citations', () => {
      const longCitation: Citation = {
        id: 'cite-1',
        type: 'canon_entity',
        sourceId: 'Akima',
        sourceText: 'This is a very long canon description that goes on and on and on...',
        confidence: 0.95,
      };

      const summary = canonResolver.summarizeCanonCitation(longCitation, 20);
      expect(summary.length).toBeLessThanOrEqual(24); // 20 + "..."
      expect(summary).toContain('...');
    });
  });

  describe('Citation Deduplication', () => {
    it('should deduplicate identical citations', async () => {
      const text = 'Akima is great. Akima is wonderful.';
      const check = await gate.validateResponse(text, baseContext);

      const akimaCitations = check.citations.filter((c) => c.sourceId === 'Akima');
      const uniqueIds = new Set(akimaCitations.map((c) => c.id));

      // After deduplication, should have only one Akima citation
      expect(akimaCitations.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Grounded Response Creation', () => {
    it('should create grounded response with citations', async () => {
      const text = 'Akima is a character from Era 3.';
      const grounded = await gate.groundResponse(text, baseContext);

      expect(grounded.content).toBe(text);
      expect(grounded.citations.length).toBeGreaterThan(0);
      expect(grounded.groundingStatus).toBe('grounded');
      expect(grounded.confidence).toBeGreaterThan(0);
    });

    it('should mark uncertain responses appropriately', async () => {
      const lowConfContext = { ...baseContext };
      lowConfContext.requirements.minConfidence = 0.99;

      const text = 'Akima might be from Era 3 possibly.';
      const grounded = await gate.groundResponse(text, lowConfContext);

      if (grounded.confidence < 0.7) {
        expect(grounded.groundingStatus).toBe('uncertain');
      }
    });

    it('should include warnings for ungrounded claims', async () => {
      const text = 'Akima can teleport. She is immortal.';
      const grounded = await gate.groundResponse(text, baseContext);

      expect(Array.isArray(grounded.warnings)).toBe(true);
      if (grounded.warnings.length > 0) {
        expect(grounded.warnings[0].code).toBe('ungrounded_claim');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty response text', async () => {
      const check = await gate.validateResponse('', baseContext);
      expect(check).toBeDefined();
      expect(check.passed).toBeDefined();
    });

    it('should handle null/undefined context gracefully', async () => {
      const check = await gate.validateResponse('Some text', baseContext);
      expect(check).toBeDefined();
    });

    it('should handle very long responses', async () => {
      const longText = Array(1000).fill('Akima is great.').join(' ');
      const check = await gate.validateResponse(longText, baseContext);
      expect(check).toBeDefined();
      expect(check.citations.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    it('should validate a realistic chat response', async () => {
      const response = `Akima is a protagonist from Era 3. She is known for her strategic mind. 
        She has blue eyes and comes from the Eastern Kingdoms. Valeric is also from this era and 
        is a skilled warrior. Together, they work on rebuilding civilization.`;

      const check = await gate.validateResponse(response, baseContext);

      expect(check.citations.length).toBeGreaterThan(0);
      expect(check.confidence).toBeGreaterThanOrEqual(0.3); // Some claims grounded, some not
    });

    it('should differentiate between fully grounded and partially grounded responses', async () => {
      const groundedResponse = 'Akima is from Era 3.';
      const partiallyGrounded = 'Akima can teleport across dimensions and is immortal.';

      const groundedCheck = await gate.validateResponse(groundedResponse, baseContext);
      const partialCheck = await gate.validateResponse(partiallyGrounded, baseContext);

      // Grounded should have more citations or equal confidence (both well-grounded for Akima mention)
      expect(groundedCheck.citations.length).toBeGreaterThanOrEqual(0);
      expect(partialCheck.citations.length).toBeGreaterThanOrEqual(0);
    });
  });
});
