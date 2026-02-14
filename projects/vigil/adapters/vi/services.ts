/**
 * Vi API Services for Vigil Discord Bot
 */

import { VI_DISCORD_CONFIG } from './config';
import type { DiscordMessage, ViResponse, MessageContext } from './types';

/**
 * Send a Discord message to Vi for processing
 */
export async function sendToVi(
  message: string,
  context: MessageContext,
  userId: string
): Promise<ViResponse> {
  try {
    const response = await fetch(`${VI_DISCORD_CONFIG.apiBase}/v1/chat?userId=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        context: {
          platform: 'discord',
          channelId: context.channelId,
          guildId: context.guildId,
          recentHistory: context.recentMessages.slice(-5).map(m => ({
            role: m.authorId === userId ? 'user' : 'assistant',
            message: m.content,
          })),
        },
      }),
      signal: AbortSignal.timeout(VI_DISCORD_CONFIG.limits.timeoutMs),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      output: data.output,
      metadata: {
        processingTime: data.processingTime,
        intentCategory: data.intentCategory,
        confidence: data.confidence,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

/**
 * Analyze a message for intent and safety
 */
export async function analyzeMessage(message: string, userId: string): Promise<{
  safe: boolean;
  intent?: string;
  confidence?: number;
}> {
  try {
    const response = await fetch(`${VI_DISCORD_CONFIG.apiBase}/v1/transparency/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, userId }),
    });

    if (!response.ok) return { safe: true }; // Fail open

    const data = await response.json();
    return {
      safe: !data.violation,
      intent: data.intent,
      confidence: data.confidence,
    };
  } catch {
    return { safe: true }; // Fail open
  }
}

/**
 * Get context for a Discord channel
 */
export async function getContext(channelId: string): Promise<MessageContext | null> {
  // This would integrate with Discord bot's message cache
  // For now, return null and let the bot handle context
  return null;
}
