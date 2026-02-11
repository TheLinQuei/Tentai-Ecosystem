/**
 * LoreChat Component
 * 
 * Example UI component showing how to integrate AstralisIdentityAdapter
 * for cross-client identity continuity when querying Vi in lore mode.
 */

import { AstralisIdentityAdapter } from '../../api/AstralisIdentityAdapter';

export interface LoreChatConfig {
  viApiUrl: string;
  userId: string; // Astralis user ID (from auth system)
  sessionId?: string;
}

export class LoreChat {
  private adapter: AstralisIdentityAdapter;
  private userId: string;
  private sessionId?: string;

  constructor(config: LoreChatConfig) {
    this.adapter = new AstralisIdentityAdapter({ viApiUrl: config.viApiUrl });
    this.userId = config.userId;
    this.sessionId = config.sessionId;
  }

  /**
   * Send lore query to Vi with proper identity headers
   * This enables cross-client continuity - Vi will remember this user's
   * preferences, relationships, and memory across Discord/Web/Lore interfaces
   */
  async queryLore(query: string): Promise<string> {
    try {
      const response = await this.adapter.queryVi(this.userId, query, {
        sessionId: this.sessionId,
        context: {
          interaction_mode: 'lore', // Request lore mode processing
        },
      });

      return response.reply || response.message || 'No response from Vi';
    } catch (error) {
      console.error('[LoreChat] Query failed:', error);
      throw error;
    }
  }

  /**
   * Map Astralis user to Vi canonical user ID
   * Useful for checking identity mappings or debugging
   */
  async getViUserId(): Promise<string> {
    return this.adapter.mapAstralisUser(this.userId);
  }

  /**
   * Example usage in a UI framework (React/Vue/etc):
   * 
   * ```typescript
   * const loreChat = new LoreChat({
   *   viApiUrl: 'http://localhost:3300',
   *   userId: currentUser.id, // From Astralis auth
   *   sessionId: currentSession.id
   * });
   * 
   * // User asks about a character
   * const response = await loreChat.queryLore(
   *   "Tell me about Aria's telekinetic abilities"
   * );
   * 
   * // Vi returns lore answer with canon citations
   * // and remembers this user's preferences (tone, verbosity, etc)
   * ```
   */
}
