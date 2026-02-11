/**
 * Citation type (aligned with brain/grounding/types)
 * Used throughout brain for source attribution.
 */
export type CitationSourceType = 'canon_entity' | 'memory' | 'tool_output' | 'user_input' | 'uncertain' | 'web' | 'doc' | 'system' | 'other';

export interface Citation {
  id: string;                           // Unique citation ID
  type: CitationSourceType;
  sourceId: string;                     // Entity ID, memory ID, tool ID, URL, or origin label
  sourceText: string;                   // The actual cited content
  confidence: number;                   // 0-1, how confident we are in this citation
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}
