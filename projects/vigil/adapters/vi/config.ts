/**
 * Vi Configuration for Vigil Discord Bot
 */

export const VI_DISCORD_CONFIG = {
  apiBase: process.env.VI_API_BASE || 'https://tentai-ecosystem.onrender.com',
  features: {
    contextAwareness: true,
    multiUserChat: true,
    channelMemory: true,
    commandProcessing: true,
  },
  limits: {
    maxContextMessages: 20,
    maxResponseLength: 2000, // Discord limit
    timeoutMs: 30000,
  },
  defaults: {
    personality: 'friendly-assistant',
    responseStyle: 'concise',
  },
};
