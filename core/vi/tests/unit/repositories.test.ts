import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { ConversationRepository } from '../../src/db/repositories/conversationRepository.js';
import { MessageRepository } from '../../src/db/repositories/messageRepository.js';

describe('Repository Unit Tests', () => {
  let mockPool: Pool;
  let conversationRepo: ConversationRepository;
  let messageRepo: MessageRepository;

  beforeEach(() => {
    mockPool = {
      query: async () => ({ rows: [] }),
    } as unknown as Pool;

    conversationRepo = new ConversationRepository(mockPool);
    messageRepo = new MessageRepository(mockPool);
  });

  describe('ConversationRepository', () => {
    it('should create conversation with valid title', async () => {
      mockPool.query = async () => ({
        rows: [
          {
            id: 'test-id',
            title: 'Test Conversation',
            createdAt: '2025-12-23T00:00:00.000Z',
          },
        ],
      }) as any;

      const result = await conversationRepo.create('Test Conversation');

      expect(result.id).toBe('test-id');
      expect(result.title).toBe('Test Conversation');
    });

    it('should return null when conversation not found', async () => {
      mockPool.query = async () => ({ rows: [] }) as any;

      const result = await conversationRepo.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('MessageRepository', () => {
    it('should create message with valid data', async () => {
      mockPool.query = async () => ({
        rows: [
          {
            id: 'msg-id',
            conversationId: 'conv-id',
            role: 'user',
            content: 'Hello',
            createdAt: '2025-12-23T00:00:00.000Z',
          },
        ],
      }) as any;

      const result = await messageRepo.create('conv-id', 'user', 'Hello');

      expect(result.id).toBe('msg-id');
      expect(result.role).toBe('user');
      expect(result.content).toBe('Hello');
    });

    it('should list messages ordered by created_at', async () => {
      mockPool.query = async () => ({
        rows: [
          {
            id: 'msg-1',
            conversationId: 'conv-id',
            role: 'user',
            content: 'First',
            createdAt: '2025-12-23T00:00:00.000Z',
          },
          {
            id: 'msg-2',
            conversationId: 'conv-id',
            role: 'assistant',
            content: 'Second',
            createdAt: '2025-12-23T00:01:00.000Z',
          },
        ],
      }) as any;

      const result = await messageRepo.listByConversation('conv-id');

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('First');
      expect(result[1].content).toBe('Second');
    });
  });
});
