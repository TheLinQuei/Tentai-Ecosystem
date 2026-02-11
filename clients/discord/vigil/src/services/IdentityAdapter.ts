/**
 * PHASE 7: Vigil Identity Adapter
 * 
 * Maps Discord users to Vi's canonical user identity system.
 * NO persona overrides - just thin identity transport.
 */

import fetch from 'node-fetch';
import { getLogger } from './logger.js'; // Assuming Vigil has logger

const logger = getLogger();

export interface ViIdentity {
  vi_user_id: string;
  provider: string;
  provider_user_id: string;
}

export class VigilIdentityAdapter {
  private viApiUrl: string;

  constructor(viApiUrl: string) {
    this.viApiUrl = viApiUrl;
  }

  /**
   * Map Discord user to Vi user ID
   * Calls core/vi GET /v1/identity/resolve?provider=discord&provider_user_id=:discordUserId
   */
  async mapDiscordUser(discordUserId: string): Promise<string> {
    try {
      const response = await fetch(
        `${this.viApiUrl}/v1/identity/resolve?provider=discord&provider_user_id=${encodeURIComponent(discordUserId)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Identity mapping failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as ViIdentity;
      logger.info({ discordUserId, vi_user_id: data.vi_user_id }, 'Discord user mapped to Vi user');
      
      return data.vi_user_id;
    } catch (error) {
      logger.error({ error, discordUserId }, 'Failed to map Discord user to Vi user');
      throw error;
    }
  }

  /**
   * Link Discord identity to existing Vi user
   * Calls core/vi POST /v1/identity/link
   */
  async linkDiscordUser(viUserId: string, discordUserId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.viApiUrl}/v1/identity/link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            vi_user_id: viUserId,
            provider: 'discord',
            provider_user_id: discordUserId
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Identity linking failed: ${response.status} ${JSON.stringify(errorData)}`);
      }

      logger.info({ viUserId, discordUserId }, 'Discord identity linked to Vi user');
    } catch (error) {
      logger.error({ error, viUserId, discordUserId }, 'Failed to link Discord identity');
      throw error;
    }
  }

  /**
   * Unlink Discord identity from Vi user
   * Calls core/vi DELETE /v1/identity/link
   */
  async unlinkDiscordUser(viUserId: string, discordUserId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.viApiUrl}/v1/identity/link`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            vi_user_id: viUserId,
            provider: 'discord',
            provider_user_id: discordUserId
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Identity unlinking failed: ${response.status} ${JSON.stringify(errorData)}`);
      }

      logger.info({ viUserId, discordUserId }, 'Discord identity unlinked from Vi user');
    } catch (error) {
      logger.error({ error, viUserId, discordUserId }, 'Failed to unlink Discord identity');
      throw error;
    }
  }

  /**
   * Build standard client envelope for Vi chat request
   * PHASE 7: ALL clients must send identity headers
   */
  buildClientEnvelope(discordUserId: string, message: string, context?: any) {
    return {
      headers: {
        'x-client-id': 'vigil',
        'x-provider': 'discord',
        'x-provider-user-id': discordUserId,
        'Content-Type': 'application/json'
      },
      body: {
        message,
        context: context || {}
      }
    };
  }

  /**
   * Send chat message to Vi with proper identity headers
   */
  async sendChatMessage(
    discordUserId: string,
    message: string,
    options?: {
      sessionId?: string;
      context?: any;
    }
  ): Promise<any> {
    try {
      const envelope = this.buildClientEnvelope(discordUserId, message, options?.context);
      
      const response = await fetch(
        `${this.viApiUrl}/v1/chat`,
        {
          method: 'POST',
          headers: envelope.headers,
          body: JSON.stringify({
            ...envelope.body,
            sessionId: options?.sessionId
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Chat request failed: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      logger.debug({ discordUserId, sessionId: options?.sessionId }, 'Chat message sent to Vi');
      
      return data;
    } catch (error) {
      logger.error({ error, discordUserId, message }, 'Failed to send chat message');
      throw error;
    }
  }
}
