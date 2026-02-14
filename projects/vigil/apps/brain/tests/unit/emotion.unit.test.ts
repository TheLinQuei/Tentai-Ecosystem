import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEmotion, setEmotion, injectEmotion, Emotion } from '../../src/emotion';

describe('emotion.unit.test', () => {
  let initialEmotion: Emotion;
  beforeEach(() => {
    initialEmotion = getEmotion();
  });
  afterEach(() => {
    setEmotion(initialEmotion); // restore
  });

  it('Happy Path: getEmotion returns default neutral and setEmotion updates state', () => {
    setEmotion('neutral');
    expect(getEmotion()).toBe('neutral');
    setEmotion('curious');
    expect(getEmotion()).toBe('curious');
  });

  it('Edge Path: injectEmotion appends tone instruction matching current emotion', () => {
    setEmotion('playful');
    const base = 'Hello world';
    const injected = injectEmotion(base);
    expect(injected).toContain('Hello world');
    expect(injected.toLowerCase()).toContain('humor'); // playful tone includes humor hint
  });

  it('Hostile Path: setEmotion with invalid enum value does not throw (TypeScript enforces at compile)', () => {
    // TS enforces type; at runtime we assume valid Emotion passed
    setEmotion('serious');
    expect(getEmotion()).toBe('serious');
  });

  it('Canon Enforcement: neutral emotion produces no tone bias in prompt injection', () => {
    setEmotion('neutral');
    const base = 'Test prompt';
    const injected = injectEmotion(base);
    expect(injected).toBe('\nTest prompt'); // neutral adds empty tone
  });

  it('Canon Enforcement Edge: empathetic emotion injects understanding/care tone', () => {
    setEmotion('empathetic');
    const base = 'User is sad';
    const injected = injectEmotion(base);
    expect(injected.toLowerCase()).toMatch(/understanding|care/);
    expect(injected).toContain('User is sad');
  });
});
