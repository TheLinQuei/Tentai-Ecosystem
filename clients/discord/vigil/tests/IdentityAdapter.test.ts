/**
 * Vigil Identity Adapter Tests
 * Tests identity mapping, linking, and chat envelope construction
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { VigilIdentityAdapter } from '../src/services/IdentityAdapter.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('VigilIdentityAdapter', () => {
  let adapter: VigilIdentityAdapter;
  const VI_API_URL = 'http://localhost:3000';

  beforeAll(() => {
    adapter = new VigilIdentityAdapter(VI_API_URL);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('mapDiscordUser', () => {
    it('should map Discord user ID to Vi user ID', async () => {
      const discordUserId = 'discord_123456';
      const expectedViUserId = 'vi_user_789';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          vi_user_id: expectedViUserId,
          provider: 'discord',
          provider_user_id: discordUserId
        })
      });

      const viUserId = await adapter.mapDiscordUser(discordUserId);

      expect(viUserId).toBe(expectedViUserId);
      expect(global.fetch).toHaveBeenCalledWith(
        `${VI_API_URL}/v1/identity/resolve?provider=discord&provider_user_id=${discordUserId}`,
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should throw error if identity resolution fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(adapter.mapDiscordUser('discord_error')).rejects.toThrow(
        'Identity mapping failed: 500 Internal Server Error'
      );
    });
  });

  describe('linkDiscordUser', () => {
    it('should link Discord user to Vi user', async () => {
      const viUserId = 'vi_user_123';
      const discordUserId = 'discord_456';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await adapter.linkDiscordUser(viUserId, discordUserId);

      expect(global.fetch).toHaveBeenCalledWith(
        `${VI_API_URL}/v1/identity/link`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vi_user_id: viUserId,
            provider: 'discord',
            provider_user_id: discordUserId
          })
        })
      );
    });

    it('should throw error if linking fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Already linked' })
      });

      await expect(adapter.linkDiscordUser('vi_user_1', 'discord_1')).rejects.toThrow(
        'Identity linking failed'
      );
    });
  });

  describe('unlinkDiscordUser', () => {
    it('should unlink Discord user from Vi user', async () => {
      const viUserId = 'vi_user_123';
      const discordUserId = 'discord_456';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await adapter.unlinkDiscordUser(viUserId, discordUserId);

      expect(global.fetch).toHaveBeenCalledWith(
        `${VI_API_URL}/v1/identity/link`,
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vi_user_id: viUserId,
            provider: 'discord',
            provider_user_id: discordUserId
          })
        })
      );
    });
  });

  describe('buildClientEnvelope', () => {
    it('should build correct identity headers', () => {
      const discordUserId = 'discord_789';
      const message = 'Hello Vi';

      const envelope = adapter.buildClientEnvelope(discordUserId, message);

      expect(envelope.headers).toEqual({
        'x-client-id': 'vigil',
        'x-provider': 'discord',
        'x-provider-user-id': discordUserId,
        'Content-Type': 'application/json'
      });
      expect(envelope.body.message).toBe(message);
    });

    it('should include context if provided', () => {
      const envelope = adapter.buildClientEnvelope('discord_123', 'Test', { foo: 'bar' });

      expect(envelope.body.context).toEqual({ foo: 'bar' });
    });
  });

  describe('sendChatMessage', () => {
    it('should send chat message with identity headers', async () => {
      const discordUserId = 'discord_123';
      const message = 'Test message';
      const sessionId = 'session_456';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Vi response' })
      });

      const response = await adapter.sendChatMessage(discordUserId, message, { sessionId });

      expect(global.fetch).toHaveBeenCalledWith(
        `${VI_API_URL}/v1/chat`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-client-id': 'vigil',
            'x-provider': 'discord',
            'x-provider-user-id': discordUserId
          }),
          body: expect.stringContaining(sessionId)
        })
      );
      expect(response).toEqual({ response: 'Vi response' });
    });
  });
});
