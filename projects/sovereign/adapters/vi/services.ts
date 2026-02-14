/**
 * Vi API Services for Sovereign
 * 
 * Handles all HTTP requests to the Vi backend
 */

import { VI_CONFIG } from './config';
import type { ChatMessage, SafetyProfile, AuditTrace, MemoryRecord } from './types';

/**
 * Send a chat message to Vi
 */
export async function sendChatMessage(
  message: string,
  userId: string,
  options?: { includeTrace?: boolean }
): Promise<{ output: string; recordId?: string; sessionId?: string }> {
  const response = await fetch(`${VI_CONFIG.apiBase}/v1/chat?userId=${encodeURIComponent(userId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      includeTrace: options?.includeTrace || false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Check backend health
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${VI_CONFIG.apiBase}/v1/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch user's safety profile
 */
export async function fetchUserProfile(userId: string): Promise<SafetyProfile | null> {
  try {
    const response = await fetch(`${VI_CONFIG.apiBase}/v1/safety/profile/${encodeURIComponent(userId)}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch audit traces
 */
export async function fetchAuditTraces(userId: string, limit: number = 10): Promise<AuditTrace[]> {
  try {
    const url = `${VI_CONFIG.apiBase}/v1/transparency/audit?userId=${encodeURIComponent(userId)}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.traces || [];
  } catch {
    return [];
  }
}

/**
 * Fetch memory audit
 */
export async function fetchMemoryAudit(userId: string, limit: number = 10): Promise<MemoryRecord[]> {
  try {
    const url = `${VI_CONFIG.apiBase}/v1/transparency/memory/audit?userId=${encodeURIComponent(userId)}&limit=${limit}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.memories || [];
  } catch {
    return [];
  }
}
