/**
 * vi-protocol: Citation schema for memory records
 * Do not import ad-hoc types in vi-core; always reference via vi-protocol.
 */
export interface Citation {
  id: string;            // Unique citation ID
  source: string;        // URL, doc ID, or origin label
  type: 'web' | 'doc' | 'user' | 'system' | 'other';
  snippet?: string;      // Short excerpt if applicable
  confidence?: number;   // 0..1 confidence score
}
