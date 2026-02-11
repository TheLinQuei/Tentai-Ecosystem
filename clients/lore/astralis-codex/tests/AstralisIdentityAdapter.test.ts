/**
 * Astralis Identity Adapter Tests
 * Tests identity mapping, linking, and lore query envelope construction
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AstralisIdentityAdapter } from '../src/api/AstralisIdentityAdapter.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('AstralisIdentityAdapter', () => {
  let adapter: AstralisIdentityAdapter;
  const VI_API_URL = 'http://localhost:3000';

  beforeEach(() => {
    adapter = new AstralisIdentityAdapter({ viApiUrl: VI_API_URL });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('mapAstralisUser', () => {
    it('should map Astralis user ID to Vi user ID', async () => {
      const astralisUserId = 'astralis_123';
      const expectedViUserId = 'vi_user_789';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          vi_user_id: expectedViUserId,
          provider: 'astralis',
          provider_user_id: astralisUserId
        })
      });

      const viUserId = await adapter.mapAstralisUser(astralisUserId);

      expect(viUserId).toBe(expectedViUserId);
      expect(global.fetch).toHaveBeenCalledWith(
        `${VI_API_URL}/v1/identity/resolve?provider=astralis&provider_user_id=${astralisUserId}`,
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

      await expect(adapter.mapAstralisUser('astralis_error')).rejects.toThrow(
        'Identity mapping failed: 500 Internal Server Error'
      );
    });
  });

  describe('linkAstralisUser', () => {
    it('should link Astralis user to Vi user', async () => {
      const viUserId = 'vi_user_123';
      const astralisUserId = 'astralis_456';
      const metadata = { username: 'testuser', email: 'test@example.com' };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await adapter.linkAstralisUser(viUserId, astralisUserId, metadata);

      expect(global.fetch).toHaveBeenCalledWith(
        `${VI_API_URL}/v1/identity/link`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vi_user_id: viUserId,
            provider: 'astralis',
            provider_user_id: astralisUserId,
            metadata
          })
        })
      );
    });

    it('should link without metadata', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await adapter.linkAstralisUser('vi_user_1', 'astralis_1');

      const call = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.metadata).toEqual({});
    });

    it('should throw error if linking fails', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Already linked' })
      });

      await expect(adapter.linkAstralisUser('vi_user_1', 'astralis_1')).rejects.toThrow(
        'Identity linking failed'
      );
    });
  });

  describe('unlinkAstralisUser', () => {
    it('should unlink Astralis user from Vi user', async () => {
      const viUserId = 'vi_user_123';
      const astralisUserId = 'astralis_456';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await adapter.unlinkAstralisUser(viUserId, astralisUserId);

      expect(global.fetch).toHaveBeenCalledWith(
        `${VI_API_URL}/v1/identity/link`,
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vi_user_id: viUserId,
            provider: 'astralis',
            provider_user_id: astralisUserId
          })
        })
      );
    });
  });

  describe('buildClientEnvelope', () => {
    it('should build correct identity headers', () => {
      const astralisUserId = 'astralis_789';

      const headers = adapter.buildClientEnvelope(astralisUserId);

      expect(headers).toEqual({
        'x-client-id': 'astralis',
        'x-provider': 'astralis',
        'x-provider-user-id': astralisUserId,
        'Content-Type': 'application/json'
      });
    });

    it('should merge additional headers', () => {
      const headers = adapter.buildClientEnvelope('astralis_123', {
        'Authorization': 'Bearer token'
      });

      expect(headers['Authorization']).toBe('Bearer token');
      expect(headers['x-provider']).toBe('astralis');
    });
  });

  describe('queryVi', () => {
    it('should send lore query with identity headers', async () => {
      const astralisUserId = 'astralis_123';
      const query = 'Who is Movado?';
      const sessionId = 'session_456';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Movado is...' })
      });

      const response = await adapter.queryVi(astralisUserId, query, { sessionId });

      expect(global.fetch).toHaveBeenCalledWith(
        `${VI_API_URL}/v1/chat`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-client-id': 'astralis',
            'x-provider': 'astralis',
            'x-provider-user-id': astralisUserId
          }),
          body: expect.stringContaining(query)
        })
      );
      expect(response).toEqual({ response: 'Movado is...' });
    });

    it('should include context if provided', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'test' })
      });

      const context = { verse: '77EZ', mode: 'lore' };
      await adapter.queryVi('astralis_1', 'test query', { context });

      const call = (global.fetch as any).mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.context).toEqual(context);
    });
  });
});
