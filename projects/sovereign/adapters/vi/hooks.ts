/**
 * React Hooks for Vi Integration
 * 
 * Provides reusable hooks for Sovereign components
 */

import { useState, useEffect, useMemo } from 'react';
import { VI_CONFIG, resolveApiBase } from './config';
import { sendChatMessage as apiSendChatMessage, checkHealth as apiCheckHealth } from './services';
import type { Conversation, ChatMessage, HealthStatus } from './types';

/**
 * Hook for managing user ID (persistent across sessions)
 */
export function useUser() {
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    if (!userId) {
      let savedUserId = localStorage.getItem('vi-user-id');
      if (!savedUserId) {
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
        savedUserId = uuid;
        localStorage.setItem('vi-user-id', uuid);
      }
      setUserId(savedUserId);
    }
  }, []);

  return { userId, setUserId };
}

/**
 * Hook for managing conversations
 */
export function useConversations(userId: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');

  // Load conversations from localStorage
  useEffect(() => {
    if (userId) {
      const saved = localStorage.getItem(`vi-conversations-${userId}`);
      if (saved) {
        try {
          const loaded = JSON.parse(saved) as Conversation[];
          setConversations(loaded);
          if (loaded.length > 0) {
            setActiveConversationId(loaded[0].id);
          }
        } catch (e) {
          console.warn('Failed to load conversations:', e);
        }
      }
    }
  }, [userId]);

  // Save conversations to localStorage whenever they change
  const saveConversations = (newConversations: Conversation[]) => {
    setConversations(newConversations);
    if (userId) {
      localStorage.setItem(`vi-conversations-${userId}`, JSON.stringify(newConversations));
    }
  };

  // Create new conversation
  const createConversation = () => {
    const conversationId = `conv-${Date.now()}`;
    const newConversation: Conversation = {
      id: conversationId,
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const updated = [newConversation, ...conversations];
    saveConversations(updated);
    setActiveConversationId(conversationId);
  };

  // Delete conversation
  const deleteConversation = (id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    saveConversations(updated);
    
    if (activeConversationId === id) {
      if (updated.length > 0) {
        setActiveConversationId(updated[0].id);
      } else {
        createConversation();
      }
    }
  };

  // Add message to conversation
  const addMessage = (conversationId: string, message: ChatMessage) => {
    const updated = conversations.map(c =>
      c.id === conversationId
        ? { 
            ...c, 
            messages: [...c.messages, message],
            updatedAt: Date.now(),
            title: c.messages.length === 0 ? message.message.substring(0, 50) : c.title
          }
        : c
    );
    saveConversations(updated);
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return {
    conversations,
    activeConversation,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    addMessage,
  };
}

/**
 * Hook for sending chat messages
 */
export function useChat(userId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const sendMessage = async (message: string): Promise<string | null> => {
    setLoading(true);
    setError('');

    try {
      const response = await apiSendChatMessage(message, userId);
      setLoading(false);
      return response.output || null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Chat failed';
      setError(errorMessage);
      setLoading(false);
      return null;
    }
  };

  return { sendMessage, loading, error };
}

/**
 * Hook for monitoring backend health
 */
export function useHealth() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const apiBase = useMemo(() => resolveApiBase(), []);

  useEffect(() => {
    const check = async () => {
      const isHealthy = await apiCheckHealth();
      setHealthStatus(isHealthy ? 'online' : 'offline');
    };

    check();
    const interval = setInterval(check, VI_CONFIG.healthCheckInterval);
    return () => clearInterval(interval);
  }, []);

  return { healthStatus, apiBase };
}
