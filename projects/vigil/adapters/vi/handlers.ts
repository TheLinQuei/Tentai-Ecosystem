/**
 * Message Handlers for Vigil Vi Integration
 */

import { sendToVi, analyzeMessage } from './services';
import type { DiscordMessage, ViResponse, MessageContext } from './types';

/**
 * Main Discord message handler
 */
export class DiscordVi {
  private contextCache: Map<string, MessageContext> = new Map();

  async handleMessage(message: DiscordMessage): Promise<string | null> {
    // Analyze for safety first
    const analysis = await analyzeMessage(message.content, message.authorId);
    if (!analysis.safe) {
      return 'I cannot process that message due to safety concerns.';
    }

    // Get or create context
    const context = this.contextCache.get(message.channelId) || {
      channelId: message.channelId,
      guildId: message.guildId,
      recentMessages: [],
    };

    // Update context with this message
    context.recentMessages.push(message);
    if (context.recentMessages.length > 20) {
      context.recentMessages.shift();
    }
    this.contextCache.set(message.channelId, context);

    // Send to Vi
    const response = await sendToVi(message.content, context, message.authorId);

    if (!response.success) {
      console.error('Vi response failed:', response.error);
      return null;
    }

    return response.output || null;
  }

  clearContext(channelId: string) {
    this.contextCache.delete(channelId);
  }

  getContext(channelId: string): MessageContext | undefined {
    return this.contextCache.get(channelId);
  }
}

/**
 * Singleton instance
 */
export const useDiscordVi = () => {
  if (!globalThis.__discordVi) {
    globalThis.__discordVi = new DiscordVi();
  }
  return globalThis.__discordVi;
};

/**
 * Message handler hook
 */
export const useMessageHandler = () => {
  const vi = useDiscordVi();
  return {
    handleMessage: vi.handleMessage.bind(vi),
    clearContext: vi.clearContext.bind(vi),
  };
};

/**
 * Context manager hook
 */
export const useContextManager = () => {
  const vi = useDiscordVi();
  return {
    getContext: vi.getContext.bind(vi),
    clearContext: vi.clearContext.bind(vi),
  };
};

// Type augmentation for global
declare global {
  var __discordVi: DiscordVi | undefined;
}
