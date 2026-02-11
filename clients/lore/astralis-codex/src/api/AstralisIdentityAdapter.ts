/**
 * Astralis Identity Adapter
 * 
 * Maps Astralis Codex users to Vi's canonical identity system.
 * Enables cross-client continuity for lore interactions.
 */

export interface ViIdentity {
  vi_user_id: string;
  provider: string;
  provider_user_id: string;
}

export interface IdentityAdapterConfig {
  viApiUrl: string;
}

export class AstralisIdentityAdapter {
  private viApiUrl: string;

  constructor(config: IdentityAdapterConfig) {
    this.viApiUrl = config.viApiUrl;
  }

  /**
   * Map Astralis user to Vi user ID
   * Calls core/vi GET /v1/identity/resolve?provider=astralis&provider_user_id=:astralisUserId
   */
  async mapAstralisUser(astralisUserId: string): Promise<string> {
    try {
      const response = await fetch(
        `${this.viApiUrl}/v1/identity/resolve?provider=astralis&provider_user_id=${encodeURIComponent(astralisUserId)}`,
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
      console.log(`[AstralisIdentityAdapter] Mapped Astralis user ${astralisUserId} to Vi user ${data.vi_user_id}`);
      
      return data.vi_user_id;
    } catch (error) {
      console.error(`[AstralisIdentityAdapter] Failed to map Astralis user ${astralisUserId}:`, error);
      throw error;
    }
  }

  /**
   * Link Astralis identity to existing Vi user
   * Calls core/vi POST /v1/identity/link
   */
  async linkAstralisUser(viUserId: string, astralisUserId: string, metadata?: Record<string, any>): Promise<void> {
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
            provider: 'astralis',
            provider_user_id: astralisUserId,
            metadata: metadata || {}
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Identity linking failed: ${response.status} ${JSON.stringify(errorData)}`);
      }

      console.log(`[AstralisIdentityAdapter] Linked Astralis user ${astralisUserId} to Vi user ${viUserId}`);
    } catch (error) {
      console.error(`[AstralisIdentityAdapter] Failed to link Astralis user ${astralisUserId}:`, error);
      throw error;
    }
  }

  /**
   * Unlink Astralis identity from Vi user
   * Calls core/vi DELETE /v1/identity/link
   */
  async unlinkAstralisUser(viUserId: string, astralisUserId: string): Promise<void> {
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
            provider: 'astralis',
            provider_user_id: astralisUserId
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Identity unlinking failed: ${response.status} ${JSON.stringify(errorData)}`);
      }

      console.log(`[AstralisIdentityAdapter] Unlinked Astralis user ${astralisUserId} from Vi user ${viUserId}`);
    } catch (error) {
      console.error(`[AstralisIdentityAdapter] Failed to unlink Astralis user ${astralisUserId}:`, error);
      throw error;
    }
  }

  /**
   * Build standard client envelope for Vi requests
   * All Astralis → Vi requests must include identity headers
   */
  buildClientEnvelope(astralisUserId: string, additionalHeaders?: Record<string, string>) {
    return {
      'x-client-id': 'astralis',
      'x-provider': 'astralis',
      'x-provider-user-id': astralisUserId,
      'Content-Type': 'application/json',
      ...additionalHeaders
    };
  }

  /**
   * Send lore query to Vi with proper identity headers
   */
  async queryVi(
    astralisUserId: string,
    query: string,
    options?: {
      sessionId?: string;
      context?: any;
    }
  ): Promise<any> {
    try {
      const headers = this.buildClientEnvelope(astralisUserId);
      
      const response = await fetch(
        `${this.viApiUrl}/v1/chat`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: query,
            sessionId: options?.sessionId,
            context: options?.context || {}
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Vi query failed: ${response.status} ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log(`[AstralisIdentityAdapter] Sent query to Vi for user ${astralisUserId}`);
      
      return data;
    } catch (error) {
      console.error(`[AstralisIdentityAdapter] Failed to query Vi:`, error);
      throw error;
    }
  }
}
