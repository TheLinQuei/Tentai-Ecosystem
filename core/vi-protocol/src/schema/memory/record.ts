import type { Citation } from './citation.js';

/**
 * vi-protocol: MemoryRecord schema definition
 */
export interface MemoryRecordProtocol {
  type: 'fact' | 'preference' | 'entity' | 'interaction' | 'context';
  content: string;
  userId: string;
  timestamp: string; // ISO
  citations?: Citation[];
  ttl?: number; // seconds; undefined = indefinite
  source?: string; // originating component
  sessionId?: string;
  confidence?: number; // 0..1
}
