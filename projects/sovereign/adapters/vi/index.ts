/**
 * Vi Integration Adapter for Sovereign
 * 
 * Provides hooks, services, and utilities for integrating Vi API
 * with the Sovereign chat console interface.
 */

export { useChat, useUser, useHealth, useConversations } from './hooks';
export { sendChatMessage, fetchUserProfile, checkHealth } from './services';
export type { 
  ChatMessage, 
  Conversation, 
  SafetyProfile, 
  LoyaltyContract, 
  AuditTrace, 
  MemoryRecord 
} from './types';
export { resolveApiBase } from './config';
