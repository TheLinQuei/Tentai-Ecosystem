import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Validation Schemas', () => {
  const createConversationSchema = z.object({
    title: z.string().min(1).max(200),
  });

  const messageBodySchema = z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1),
  });

  describe('Conversation Schema', () => {
    it('should accept valid conversation title', () => {
      const result = createConversationSchema.safeParse({
        title: 'Valid Title',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty title', () => {
      const result = createConversationSchema.safeParse({ title: '' });
      expect(result.success).toBe(false);
    });

    it('should reject title over 200 chars', () => {
      const result = createConversationSchema.safeParse({
        title: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing title', () => {
      const result = createConversationSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('Message Schema', () => {
    it('should accept valid user message', () => {
      const result = messageBodySchema.safeParse({
        role: 'user',
        content: 'Hello',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid assistant message', () => {
      const result = messageBodySchema.safeParse({
        role: 'assistant',
        content: 'Hi there',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid system message', () => {
      const result = messageBodySchema.safeParse({
        role: 'system',
        content: 'System message',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = messageBodySchema.safeParse({
        role: 'invalid',
        content: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty content', () => {
      const result = messageBodySchema.safeParse({
        role: 'user',
        content: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing content', () => {
      const result = messageBodySchema.safeParse({ role: 'user' });
      expect(result.success).toBe(false);
    });
  });
});
