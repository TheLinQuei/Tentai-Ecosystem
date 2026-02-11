/**
 * AmbiguityGate: 5 surgical tests for v1.1 hardening
 * 
 * These tests verify that malformed/ambiguous input returns clarification
 * instead of proceeding to planning and confident answers.
 */

import { describe, it, expect } from 'vitest';
import { AmbiguityGate } from '../../src/brain/AmbiguityGate.js';

describe('AmbiguityGate', () => {
  const gate = new AmbiguityGate();

  // Test 1: Malformed short input → returns clarification (no plan generation)
  describe('Test 1: malformed_short_input', () => {
    it('should flag "so what not" as malformed and return clarification', () => {
      const input = 'so what not';
      const recentHistory: string[] = [];
      
      const result = gate.detect(input, recentHistory);
      
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
      expect(result?.type).toBe('malformed_query');
      expect(result?.confidence).toBeGreaterThan(0.8);
      expect(result?.clarificationPrompt).toBeDefined();
      expect(result?.clarificationPrompt.length).toBeGreaterThan(10);
    });

    it('should flag "when time we" as malformed', () => {
      const input = 'when time we';
      const result = gate.detect(input);
      
      expect(result?.detected).toBe(true);
      expect(result?.type).toBe('malformed_query');
    });

    it('should allow normal short commands like "hi" or "okay"', () => {
      const inputs = ['hi', 'hello', 'okay', 'thanks', 'yes', 'no'];
      
      for (const input of inputs) {
        const result = gate.detect(input);
        expect(result?.type).not.toBe('malformed_query');
      }
    });
  });

  // Test 2: Dangling reference with no anchor → returns clarification
  describe('Test 2: dangling_reference_no_anchor', () => {
    it('should flag "that" with empty history as dangling reference', () => {
      const input = 'what about that?';
      const recentHistory: string[] = [];
      
      const result = gate.detect(input, recentHistory);
      
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
      expect(result?.type).toBe('dangling_reference');
      expect(result?.confidence).toBeGreaterThan(0.8);
      expect(result?.clarificationPrompt).toContain('context');
    });

    it('should flag "it" with empty history', () => {
      const input = 'can you do it?';
      const result = gate.detect(input, []);
      
      expect(result?.detected).toBe(true);
      expect(result?.type).toBe('dangling_reference');
    });

    it('should allow "that" when history is present', () => {
      const input = 'what about that?';
      const recentHistory = [
        'User: I talked about the problem earlier.',
        'Vi: Yes, I remember. What about it?'
      ];
      
      const result = gate.detect(input, recentHistory);
      
      expect(result?.type).not.toBe('dangling_reference');
    });
  });

  // Test 3: Underspecified comparison → returns clarification
  describe('Test 3: underspecified_comparison', () => {
    it('should flag "that was better" (better than what?) as underspecified', () => {
      const input = 'that was better';
      
      const result = gate.detect(input);
      
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
      expect(result?.type).toBe('underspecified_comparison');
      expect(result?.confidence).toBeGreaterThan(0.7);
      expect(result?.clarificationPrompt).toContain('what');
    });

    it('should allow "that was better than the first one" (complete comparison)', () => {
      const input = 'that was better than the first one';
      
      const result = gate.detect(input);
      
      expect(result?.type).not.toBe('underspecified_comparison');
    });

    it('should flag "compare this" (with what?) as underspecified', () => {
      const input = 'compare this';
      
      const result = gate.detect(input);
      
      expect(result?.detected).toBe(true);
      expect(result?.type).toBe('underspecified_comparison');
    });
  });

  // Test 4: Contradictory request → returns clarification
  describe('Test 4: contradictory_request', () => {
    it('should flag "list all but none" as contradictory', () => {
      const input = 'list all items but exclude everything';
      
      const result = gate.detect(input);
      
      expect(result).not.toBeNull();
      expect(result?.detected).toBe(true);
      expect(result?.type).toBe('contradictory_request');
      expect(result?.confidence).toBeGreaterThan(0.9);
      expect(result?.clarificationPrompt).toContain('contradictory');
    });

    it('should flag "yes and no" as contradictory', () => {
      const input = 'yes but no don\'t do it';
      
      const result = gate.detect(input);
      
      expect(result?.detected).toBe(true);
      expect(result?.type).toBe('contradictory_request');
    });
  });

  // Test 5: Clear request proceeds without ambiguity flagging
  describe('Test 5: clear_request_so_what_now', () => {
    it('should allow "so what now?" (clear question) to proceed', () => {
      const input = 'so what now?';
      
      const result = gate.detect(input);
      
      // Should NOT flag as malformed (even though "so what now" is similar to "so what not")
      // because "now" is a real word making it grammatically valid
      expect(result?.type).not.toBe('malformed_query');
    });

    it('should allow normal queries like "what is the capital of France?"', () => {
      const input = 'what is the capital of France?';
      
      const result = gate.detect(input);
      
      expect(result).toBeNull();
    });

    it('should allow clear commands', () => {
      const input = 'tell me about the weather today';
      
      const result = gate.detect(input);
      
      expect(result).toBeNull();
    });

    it('should allow conversational input', () => {
      const input = 'I\'ve been thinking about this problem and I\'d like your perspective';
      
      const result = gate.detect(input);
      
      expect(result).toBeNull();
    });
  });
});
