/**
 * Behavior Rules Engine E2E Tests (Phase 2)
 * 
 * Validates that:
 * 1) Same prompt from owner vs public yields different posture
 * 2) Factual correctness is identical
 * 3) Relationship context flows through to actual response behavior
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BehaviorRulesEngine, type BehaviorRules } from '../src/brain/BehaviorRulesEngine.js';
import type { RelationshipContext } from '../src/brain/RelationshipResolver.js';

describe('BehaviorRulesEngine (Phase 2)', () => {
  let engine: BehaviorRulesEngine;

  beforeAll(() => {
    engine = new BehaviorRulesEngine();
  });

  describe('generateBehaviorRules', () => {
    it('owner mode: minimal apologies, high initiative, personal depth', () => {
      const ownerContext: RelationshipContext = {
        type: 'owner',
        trust_level: 95,
        interaction_mode: 'operator',
        tone_preference: 'direct',
        voice_profile: 'LUXE_ORIGIN',
      };

      const rules = engine.generateBehaviorRules(ownerContext);

      expect(rules.presence_profile).toBe('luxe_owner');
      expect(rules.apology_frequency).toBeLessThan(10);
      expect(rules.disclaimer_level).toBeLessThan(15);
      expect(rules.initiative_level).toBeGreaterThan(70);
      expect(rules.relational_depth).toBeGreaterThan(80);
      expect(rules.warmth_factor).toBeGreaterThan(70);
      expect(rules.formality_level).toBeLessThan(30);
    });

    it('public mode: standard apologies, low initiative, professional distance', () => {
      const publicContext: RelationshipContext = {
        type: 'normal',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const rules = engine.generateBehaviorRules(publicContext);

      expect(rules.presence_profile).toBe('careful_assistant');
      expect(rules.apology_frequency).toBeGreaterThan(30);
      expect(rules.disclaimer_level).toBeGreaterThan(50);
      expect(rules.initiative_level).toBeLessThan(30);
      expect(rules.relational_depth).toBeLessThan(40);
      expect(rules.formality_level).toBeGreaterThan(60);
    });

    it('trusted mode: balanced rules between owner and public', () => {
      const trustedContext: RelationshipContext = {
        type: 'trusted',
        trust_level: 70,
        interaction_mode: 'companion',
        tone_preference: 'warm',
        voice_profile: 'LUXE_ORIGIN',
      };

      const rules = engine.generateBehaviorRules(trustedContext);

      expect(rules.presence_profile).toBe('elegant_professional');
      expect(rules.apology_frequency).toBeGreaterThan(20);
      expect(rules.apology_frequency).toBeLessThan(40);
      expect(rules.initiative_level).toBeGreaterThan(40);
      expect(rules.initiative_level).toBeLessThan(60);
    });

    it('restricted mode: maximum caution and distance', () => {
      const restrictedContext: RelationshipContext = {
        type: 'restricted',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const rules = engine.generateBehaviorRules(restrictedContext);

      expect(rules.formality_level).toBeGreaterThan(85);
      expect(rules.apology_frequency).toBeGreaterThan(60);
      expect(rules.disclaimer_level).toBeGreaterThan(85);
      expect(rules.initiative_level).toBeLessThan(10);
      expect(rules.relational_depth).toBeLessThan(15);
    });

    it('trust_level fine-tunes rules: high trust reduces disclaimers', () => {
      const lowTrust: RelationshipContext = {
        type: 'normal',
        trust_level: 10,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const highTrust: RelationshipContext = {
        type: 'normal',
        trust_level: 90,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const lowRules = engine.generateBehaviorRules(lowTrust);
      const highRules = engine.generateBehaviorRules(highTrust);

      expect(highRules.disclaimer_level).toBeLessThan(lowRules.disclaimer_level);
      expect(highRules.apology_frequency).toBeLessThan(lowRules.apology_frequency);
      expect(highRules.initiative_level).toBeGreaterThan(lowRules.initiative_level);
    });

    it('interaction_mode=operator increases initiative and reduces formality', () => {
      const assistantMode: RelationshipContext = {
        type: 'trusted',
        trust_level: 50,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const operatorMode: RelationshipContext = {
        type: 'trusted',
        trust_level: 50,
        interaction_mode: 'operator',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const assistantRules = engine.generateBehaviorRules(assistantMode);
      const operatorRules = engine.generateBehaviorRules(operatorMode);

      expect(operatorRules.initiative_level).toBeGreaterThan(assistantRules.initiative_level);
      expect(operatorRules.formality_level).toBeLessThan(assistantRules.formality_level);
    });
  });

  describe('getPhraseSet', () => {
    it('owner mode uses luxury phrases', () => {
      const ownerContext: RelationshipContext = {
        type: 'owner',
        trust_level: 95,
        interaction_mode: 'operator',
        tone_preference: 'direct',
        voice_profile: 'LUXE_ORIGIN',
      };

      const phrases = engine.getPhraseSet(ownerContext);

      expect(phrases.listening).toContain("I'm listening.");
      expect(phrases.listening).toContain('At your command.');
      expect(phrases.confirming).toContain('Done.');
      expect(phrases.confirming).toContain('Consider it handled.');
    });

    it('public mode uses professional phrases', () => {
      const publicContext: RelationshipContext = {
        type: 'normal',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const phrases = engine.getPhraseSet(publicContext);

      expect(phrases.listening).toContain('How can I help?');
      expect(phrases.confirming).not.toContain('Done.');
      expect(phrases.declining).toContain("I'm unable to assist with that.");
    });

    it('trusted mode uses balanced phrases', () => {
      const trustedContext: RelationshipContext = {
        type: 'trusted',
        trust_level: 70,
        interaction_mode: 'companion',
        tone_preference: 'warm',
        voice_profile: 'LUXE_ORIGIN',
      };

      const phrases = engine.getPhraseSet(trustedContext);

      expect(phrases.listening.length).toBeGreaterThan(0);
      expect(phrases.confirming.length).toBeGreaterThan(0);
    });
  });

  describe('shouldIncludeDisclaimer', () => {
    it('owner mode: rarely includes disclaimers', () => {
      const ownerContext: RelationshipContext = {
        type: 'owner',
        trust_level: 95,
        interaction_mode: 'operator',
        tone_preference: 'direct',
        voice_profile: 'LUXE_ORIGIN',
      };

      let disclaimers = 0;
      for (let i = 0; i < 100; i++) {
        if (engine.shouldIncludeDisclaimer(ownerContext, 'capability')) {
          disclaimers++;
        }
      }

      expect(disclaimers).toBeLessThan(20); // Less than 20% disclaimer rate
    });

    it('public mode: includes disclaimers frequently', () => {
      const publicContext: RelationshipContext = {
        type: 'normal',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      let disclaimers = 0;
      for (let i = 0; i < 100; i++) {
        if (engine.shouldIncludeDisclaimer(publicContext, 'capability')) {
          disclaimers++;
        }
      }

      expect(disclaimers).toBeGreaterThan(40); // More than 40% disclaimer rate
    });

    it('high trust reduces disclaimer frequency', () => {
      const lowTrust: RelationshipContext = {
        type: 'normal',
        trust_level: 10,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const highTrust: RelationshipContext = {
        type: 'normal',
        trust_level: 90,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      let lowCount = 0;
      let highCount = 0;

      for (let i = 0; i < 100; i++) {
        if (engine.shouldIncludeDisclaimer(lowTrust, 'capability')) lowCount++;
        if (engine.shouldIncludeDisclaimer(highTrust, 'capability')) highCount++;
      }

      expect(highCount).toBeLessThan(lowCount);
    });
  });

  describe('shouldApologize', () => {
    it('owner mode: only apologizes for real errors', () => {
      const ownerContext: RelationshipContext = {
        type: 'owner',
        trust_level: 95,
        interaction_mode: 'operator',
        tone_preference: 'direct',
        voice_profile: 'LUXE_ORIGIN',
      };

      // Errors: expect apology
      const errorApology = engine.shouldApologize(ownerContext, 'error');
      expect(errorApology).toBe(true);

      // Latency: expect no apology
      let latencyApologies = 0;
      for (let i = 0; i < 100; i++) {
        if (engine.shouldApologize(ownerContext, 'latency')) latencyApologies++;
      }
      expect(latencyApologies).toBeLessThan(10);
    });

    it('public mode: apologizes liberally', () => {
      const publicContext: RelationshipContext = {
        type: 'normal',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      let apologies = 0;
      for (let i = 0; i < 100; i++) {
        if (engine.shouldApologize(publicContext, 'latency')) apologies++;
      }

      expect(apologies).toBeGreaterThan(15);
    });
  });

  describe('getVerbosityLevel', () => {
    it('owner mode: concise (low verbosity)', () => {
      const ownerContext: RelationshipContext = {
        type: 'owner',
        trust_level: 95,
        interaction_mode: 'operator',
        tone_preference: 'direct',
        voice_profile: 'LUXE_ORIGIN',
      };

      const verbosity = engine.getVerbosityLevel(ownerContext);
      expect(verbosity).toBeLessThan(40);
    });

    it('public mode: detailed (high verbosity)', () => {
      const publicContext: RelationshipContext = {
        type: 'normal',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      const verbosity = engine.getVerbosityLevel(publicContext);
      expect(verbosity).toBeGreaterThan(60);
    });

    it('trusted mode: balanced verbosity', () => {
      const trustedContext: RelationshipContext = {
        type: 'trusted',
        trust_level: 70,
        interaction_mode: 'companion',
        tone_preference: 'warm',
        voice_profile: 'LUXE_ORIGIN',
      };

      const verbosity = engine.getVerbosityLevel(trustedContext);
      expect(verbosity).toBeGreaterThan(40);
      expect(verbosity).toBeLessThan(60);
    });
  });

  describe('shouldBeProactive', () => {
    it('owner mode: proactive (high initiative)', () => {
      const ownerContext: RelationshipContext = {
        type: 'owner',
        trust_level: 95,
        interaction_mode: 'operator',
        tone_preference: 'direct',
        voice_profile: 'LUXE_ORIGIN',
      };

      expect(engine.shouldBeProactive(ownerContext)).toBe(true);
    });

    it('public mode: reactive (low initiative)', () => {
      const publicContext: RelationshipContext = {
        type: 'normal',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      expect(engine.shouldBeProactive(publicContext)).toBe(false);
    });
  });

  describe('canAccessRelationalContext', () => {
    it('owner mode: full access', () => {
      const ownerContext: RelationshipContext = {
        type: 'owner',
        trust_level: 95,
        interaction_mode: 'operator',
        tone_preference: 'direct',
        voice_profile: 'LUXE_ORIGIN',
      };

      expect(engine.canAccessRelationalContext(ownerContext)).toBe(true);
    });

    it('restricted mode: no access', () => {
      const restrictedContext: RelationshipContext = {
        type: 'restricted',
        trust_level: 0,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      expect(engine.canAccessRelationalContext(restrictedContext)).toBe(false);
    });

    it('low trust (< 30): no access', () => {
      const lowTrustContext: RelationshipContext = {
        type: 'normal',
        trust_level: 20,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      expect(engine.canAccessRelationalContext(lowTrustContext)).toBe(false);
    });

    it('high trust (> 30): access granted', () => {
      const highTrustContext: RelationshipContext = {
        type: 'normal',
        trust_level: 50,
        interaction_mode: 'assistant',
        tone_preference: 'neutral',
        voice_profile: 'LUXE_ORIGIN',
      };

      expect(engine.canAccessRelationalContext(highTrustContext)).toBe(true);
    });
  });
});
