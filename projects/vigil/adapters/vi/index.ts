/**
 * Vi Integration Adapter for Vigil (Discord Bot)
 * 
 * Provides Discord-specific Vi integration including
 * message handling, context management, and command processing.
 */

export { useDiscordVi, useMessageHandler, useContextManager } from './handlers';
export { sendToVi, analyzeMessage, getContext } from './services';
export type { DiscordMessage, ViResponse, MessageContext } from './types';
export { VI_DISCORD_CONFIG } from './config';
