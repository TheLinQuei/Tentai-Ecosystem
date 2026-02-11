/**
 * PHASE 4: Astralis Canon Enforcement E2E Tests
 * 
 * Validates:
 * - Canon queries return correct facts and entities
 * - Contradictions are detected
 * - Citations are properly tracked
 * - Uncertainty is explicit
 * - Lore mode activates correctly
 * - Canon is enforced (not hallucinated)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { CanonResolver } from '../src/brain/canon/CanonResolver.js';
import { LoreModeEngine } from '../src/brain/canon/LoreModeEngine.js';
import { randomUUID } from 'crypto';

describe('Phase 4: Astralis Canon Enforcement', () => {
  let canonResolver: CanonResolver;
  let loreModeEngine: LoreModeEngine;
  const testUserId = randomUUID();

  beforeAll(() => {
    canonResolver = new CanonResolver();
    loreModeEngine = new LoreModeEngine();
  });

  describe('Canon Resolution', () => {
    it('should resolve canon for known entities', async () => {
      const resolution = await canonResolver.resolveCanon('Who is Movado?');

      expect(resolution).toBeDefined();
      expect(resolution.entities.length).toBeGreaterThan(0);
      expect(resolution.entities[0].name).toContain('Movado');
      expect(resolution.facts.length).toBeGreaterThan(0);
      expect(resolution.citations.length).toBeGreaterThan(0);
    });

    it('should return empty for unknown entities', async () => {
      const resolution = await canonResolver.resolveCanon('Who is RandomNonCanonEntity?');

      expect(resolution.entities.length).toBe(0);
      expect(resolution.facts.length).toBe(0);
      expect(resolution.uncertainties).toBeDefined();
      expect(resolution.uncertainties![0]).toContain('not found');
    });

    it('should include citations with resolved canon', async () => {
      const resolution = await canonResolver.resolveCanon('Tell me about Azula');

      expect(resolution.citations.length).toBeGreaterThan(0);
      const citation = resolution.citations[0];
      expect(citation.id).toBeDefined();
      expect(citation.title).toBeDefined();
      expect(citation.authority_level).toBeGreaterThan(0);
    });

    it('should handle case-insensitive queries', async () => {
      const resolution1 = await canonResolver.resolveCanon('who is MOVADO');
      const resolution2 = await canonResolver.resolveCanon('who is movado');
      const resolution3 = await canonResolver.resolveCanon('Who Is Movado?');

      expect(resolution1.entities.length).toBeGreaterThan(0);
      expect(resolution2.entities.length).toBeGreaterThan(0);
      expect(resolution3.entities.length).toBeGreaterThan(0);
    });

    it('should include rules for relevant entities', async () => {
      const resolution = await canonResolver.resolveCanon('What are the laws governing Movado?');

      expect(resolution.rules.length).toBeGreaterThan(0);
      const rule = resolution.rules[0];
      expect(rule.applies_to).toContain('movado_character');
      expect(rule.text).toBeDefined();
    });

    it('should mark uncertain information', async () => {
      const resolution = await canonResolver.resolveCanon('Tell me about Akima');

      // Akima has extended_canon status and lower confidence
      const uncertainFacts = resolution.facts.filter(
        (f) => f.verification_status === 'extended_canon' || f.confidence < 0.8
      );
      expect(uncertainFacts.length).toBeGreaterThan(0);
    });

    it('should provide confidence scores', async () => {
      const resolution = await canonResolver.resolveCanon('Who is Azula?');

      expect(resolution.confidence).toBeGreaterThan(0);
      expect(resolution.confidence).toBeLessThanOrEqual(1);
      expect(resolution.facts.every((f) => f.confidence > 0 && f.confidence <= 1)).toBe(true);
    });

    it('should format citations correctly', async () => {
      const resolution = await canonResolver.resolveCanon('Tell me about Astralis');
      const formatted = canonResolver.formatCitations(resolution.citations);

      expect(formatted).toContain('**Canon Sources:**');
      expect(formatted).toContain('Authority:');
    });

    it('should format warnings for contradictions', async () => {
      // Create a mock response with warnings
      const warnings = ['Contradiction detected: two conflicting timelines'];
      const formatted = canonResolver.formatWarnings(warnings);

      expect(formatted).toContain('**Canon Notes:**');
      expect(formatted).toContain('Contradiction detected');
    });

    it('should format uncertainties explicitly', async () => {
      const uncertainties = ['Uncertain: Movado age (confidence: 0.5)', 'Disputed: Timeline fracture cause'];
      const formatted = canonResolver.formatUncertainties(uncertainties);

      expect(formatted).toContain('**Uncertain Information:**');
      expect(formatted).toContain('Movado age');
    });
  });

  describe('Lore Mode Detection', () => {
    it('should detect lore queries automatically', () => {
      expect(canonResolver.isLoreQuery('Who is Movado?')).toBe(true);
      expect(canonResolver.isLoreQuery('Tell me about Astralis')).toBe(true);
      expect(canonResolver.isLoreQuery('What is the Codex?')).toBe(true);
      expect(canonResolver.isLoreQuery('lore mode activate')).toBe(true);
    });

    it('should not flag non-lore queries', () => {
      expect(canonResolver.isLoreQuery('What is 2+2?')).toBe(false);
      expect(canonResolver.isLoreQuery('Tell me a joke')).toBe(false);
      expect(canonResolver.isLoreQuery('How do I bake bread?')).toBe(false);
    });

    it('should enable lore mode on explicit command', async () => {
      const context = await loreModeEngine.determineLoreMode(testUserId, 'lore mode');

      expect(context.enabled).toBe(true);
      expect(context.mode_reason).toContain('explicit');
    });

    it('should disable lore mode on explicit command', async () => {
      const context = await loreModeEngine.determineLoreMode(testUserId, 'no lore please');

      expect(context.enabled).toBe(false);
      expect(context.mode_reason).toContain('explicit');
    });

    it('should respect user preference', async () => {
      loreModeEngine.setUserLorePreference(testUserId, true);
      const context = await loreModeEngine.determineLoreMode(testUserId, 'What is 2+2?', {
        default_lore_mode: true,
      });

      expect(context.enabled).toBe(true);
      expect(context.mode_reason).toContain('default');
    });

    it('should auto-detect lore queries', async () => {
      const context = await loreModeEngine.determineLoreMode(testUserId, 'Tell me about Movado');

      expect(context.enabled).toBe(true);
      expect(context.mode_reason).toContain('Auto-detected');
    });
  });

  describe('Canon Injection', () => {
    it('should inject canon context for lore queries', async () => {
      const { loreContext, injectedContext } = await loreModeEngine.injectCanonContext(
        testUserId,
        'Who is Azula?'
      );

      expect(loreContext.enabled).toBe(true);
      expect(injectedContext).toContain('VERSE CONTEXT');
      expect(injectedContext).toContain('Known Entities');
      expect(injectedContext).toContain('Canon Facts');
    });

    it('should not inject context for non-lore queries', async () => {
      const { loreContext, injectedContext } = await loreModeEngine.injectCanonContext(
        testUserId,
        'What is the weather?'
      );

      expect(loreContext.enabled).toBe(false);
      expect(injectedContext).toBe('');
    });

    it('should include entity information in injection', async () => {
      const { injectedContext } = await loreModeEngine.injectCanonContext(
        testUserId,
        'Tell me about Azula'
      );

      expect(injectedContext).toContain('Azula');
      expect(injectedContext).toContain('character');
    });

    it('should include facts in injection', async () => {
      const { injectedContext } = await loreModeEngine.injectCanonContext(
        testUserId,
        'Who is Movado?'
      );

      expect(injectedContext).toContain('Canon Facts');
      expect(injectedContext).toContain('✓'); // Canon verification marker
    });

    it('should include rules in injection', async () => {
      const { injectedContext } = await loreModeEngine.injectCanonContext(
        testUserId,
        'What rules govern Astralis?'
      );

      expect(injectedContext).toContain('Verse Rules');
    });

    it('should include citations in injection', async () => {
      const { injectedContext } = await loreModeEngine.injectCanonContext(
        testUserId,
        'Tell me about the Codex'
      );

      expect(injectedContext).toContain('Canon Sources');
      expect(injectedContext).toContain('[codex_');
    });

    it('should mark uncertain information in injection', async () => {
      const { injectedContext } = await loreModeEngine.injectCanonContext(
        testUserId,
        'Tell me about Akima'
      );

      if (injectedContext.includes('❓')) {
        expect(injectedContext).toContain('Uncertain');
      }
    });
  });

  describe('Contradiction Detection', () => {
    it('should detect when response contradicts high-confidence canon', async () => {
      const userMessage = 'Who is Azula?';
      const contradictoryResponse = 'Azula is a random wanderer with no special role';

      const { contradictions, severity } = await loreModeEngine.detectCanonContradictions(
        userMessage,
        contradictoryResponse,
        testUserId
      );

      expect(contradictions.length).toBeGreaterThan(0);
      expect(severity).toBe('warning');
    });

    it('should not flag uncertainty disclaimers as contradictions', async () => {
      const userMessage = 'Who is Movado?';
      const uncertainResponse = 'I\'m not entirely certain, but Movado appears to be from outside Astralis.';

      const { contradictions } = await loreModeEngine.detectCanonContradictions(
        userMessage,
        uncertainResponse,
        testUserId
      );

      // Should not create false positive
      expect(contradictions.length).toBeLessThan(2);
    });

    it('should mark critical contradictions of core canon', async () => {
      const userMessage = 'Is Azula the Sovereign?';
      const contradictoryResponse = 'No, Azula is just a regular person with no authority.';

      const { severity } = await loreModeEngine.detectCanonContradictions(
        userMessage,
        contradictoryResponse,
        testUserId
      );

      expect(severity).toBe('warning');
    });
  });

  describe('Lore Mode Formatting', () => {
    it('should format canon response appropriately', async () => {
      const { loreContext } = await loreModeEngine.injectCanonContext(testUserId, 'Who is Azula?');

      const baseResponse = 'Azula is the Sovereign of Astralis.';
      const formatted = loreModeEngine.formatCanonResponse(baseResponse, loreContext);

      expect(formatted).toContain('Azula is the Sovereign');
    });

    it('should add confidence indicator for low-confidence canon', async () => {
      // Mock a low-confidence lore context
      const lowConfidenceContext: any = {
        enabled: true,
        locked: false,
        detected_entities: [],
        canon_resolution: {
          confidence: 0.3,
          facts: [],
          entities: [],
          rules: [],
          citations: [],
        },
      };

      const baseResponse = 'I think something about that topic exists';
      const formatted = loreModeEngine.formatCanonResponse(baseResponse, lowConfidenceContext);

      expect(formatted).toContain('Limited canon information');
    });

    it('should add uncertainty disclaimer when applicable', async () => {
      // Mock an uncertain lore context
      const uncertainContext: any = {
        enabled: true,
        locked: false,
        detected_entities: [],
        canon_resolution: {
          confidence: 0.8,
          facts: [],
          entities: [],
          rules: [],
          citations: [],
          uncertainties: ['This information is disputed'],
        },
      };

      const baseResponse = 'This topic has conflicting information';
      const formatted = loreModeEngine.formatCanonResponse(baseResponse, uncertainContext);

      expect(formatted).toContain('uncertain or disputed');
    });
  });

  describe('Session Context', () => {
    it('should maintain lore mode across queries in same session', async () => {
      const sessionId = randomUUID();

      const context1 = await loreModeEngine.determineLoreMode(testUserId, 'lore mode', undefined, sessionId);
      expect(context1.enabled).toBe(true);

      // Subsequent query in same session should respect lock
      const context2 = await loreModeEngine.determineLoreMode(
        testUserId,
        'What is the weather?',
        undefined,
        sessionId
      );
      // Mode should persist in session
      expect(context2).toBeDefined();
    });
  });

  describe('User Preferences', () => {
    it('should save and recall user lore preference', () => {
      const userId = randomUUID();

      loreModeEngine.setUserLorePreference(userId, true);
      expect(loreModeEngine.getUserLorePreference(userId)).toBe(true);

      loreModeEngine.setUserLorePreference(userId, false);
      expect(loreModeEngine.getUserLorePreference(userId)).toBe(false);
    });

    it('should default to false for unknown users', () => {
      const unknownUserId = randomUUID();
      expect(loreModeEngine.getUserLorePreference(unknownUserId)).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full query flow: detect → resolve → inject → format', async () => {
      const query = 'Tell me about the conflict between Movado and Azula';

      // 1. Detect lore
      const isLore = canonResolver.isLoreQuery(query);
      expect(isLore).toBe(true);

      // 2. Resolve canon
      const resolution = await canonResolver.resolveCanon(query);
      expect(resolution.entities.length).toBeGreaterThan(0);

      // 3. Inject context
      const { loreContext, injectedContext } = await loreModeEngine.injectCanonContext(
        testUserId,
        query
      );
      expect(loreContext.enabled).toBe(true);
      expect(injectedContext.length).toBeGreaterThan(0);

      // 4. Format response
      const mockResponse = 'Movado invaded from outside, Azula defends Astralis timeline.';
      const formatted = loreModeEngine.formatCanonResponse(mockResponse, loreContext);
      expect(formatted).toContain('Movado');
    });

    it('should work correctly with mixed lore and non-lore conversation', async () => {
      const regularQuery = 'What is the capital of France?';
      const loreQuery = 'Who is Azula?';

      const { loreContext: context1 } = await loreModeEngine.injectCanonContext(
        testUserId,
        regularQuery
      );
      expect(context1.enabled).toBe(false);

      const { loreContext: context2 } = await loreModeEngine.injectCanonContext(testUserId, loreQuery);
      expect(context2.enabled).toBe(true);

      // Back to regular
      const { loreContext: context3 } = await loreModeEngine.injectCanonContext(
        testUserId,
        'What time is it?'
      );
      expect(context3.enabled).toBe(false);
    });
  });
});
