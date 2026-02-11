/**
 * Grounding Types — Phase 2: Enforcement Layer
 *
 * Defines types for citation tracking, canon resolution, and response validation
 * ensuring all responses are grounded in canon, memory, or tool outputs.
 */

/**
 * Citation source types
 */
export type CitationSourceType = 'canon_entity' | 'memory' | 'tool_output' | 'user_input' | 'uncertain';

/**
 * Canon operational modes
 */
export type CanonMode = 'brainstorm' | 'commit' | 'lock' | 'export' | 'query';

/**
 * A single citation for a claim
 */
export interface Citation {
  id: string;                           // Unique citation ID
  type: CitationSourceType;
  sourceId: string;                     // Entity ID, memory ID, or tool ID
  sourceText: string;                   // The actual cited content
  confidence: number;                   // 0-1, how confident we are in this citation
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Extracted claim from a response
 */
export interface Claim {
  id: string;
  text: string;
  startIdx: number;
  endIdx: number;
  claimType: 'factual' | 'procedural' | 'directive' | 'uncertainty';
  relatedEntities: string[];            // Entity names or IDs mentioned
}

/**
 * Grounding requirements for a response
 */
export interface GroundingRequirements {
  canonMode: CanonMode;
  requireCitations: boolean;
  minConfidence: number;                // 0-1, min confidence to allow claim
  allowUnknown: boolean;                // Can say "unknown in canon"
  maxUngroundedClaims: number;          // 0 = none allowed
}

/**
 * Result of grounding validation
 */
export interface GroundingCheck {
  passed: boolean;
  citations: Citation[];
  confidence: number;                   // Overall confidence 0-1
  missingGrounding: string[];           // Claims that lack grounding
  ungroundedClaims: Claim[];
  recommendation: 'allow' | 'block' | 'warn' | 'ask_user';
  reason?: string;
}

/**
 * Context needed for grounding validation
 */
export interface GroundingContext {
  userId: string;
  conversationId: string;
  sessionId: string;
  canonMode: CanonMode;
  requirements: GroundingRequirements;
  availableMemories: Map<string, string>;  // Entity ID → memory text
  availableCanon: Map<string, string>;     // Entity ID → canon entity data
}

/**
 * Canon entity for lookup
 */
export interface CanonEntity {
  id: string;
  name: string;
  description: string;
  era?: string;
  properties: Record<string, unknown>;
  relatedEntities: string[];
  locked: boolean;
  confidence: number;
}

/**
 * Memory record for grounding
 */
export interface MemoryRecord {
  id: string;
  text: string;
  entityId?: string;
  sessionId?: string;
  confidence: number;
  timestamp: Date;
  dimension: 'long_term' | 'short_term' | 'episodic';
}

/**
 * Tool output that can be cited
 */
export interface ToolOutput {
  id: string;
  toolName: string;
  result: unknown;
  timestamp: Date;
  confidence: number;
}

/**
 * Grounding error
 */
export interface GroundingError {
  code: string;
  message: string;
  failedClaim?: Claim;
  suggestions?: string[];
}

/**
 * Response with grounding metadata
 */
export interface GroundedResponse {
  content: string;
  citations: Citation[];
  confidence: number;
  groundingStatus: 'grounded' | 'ungrounded' | 'uncertain' | 'blocked';
  warnings: GroundingError[];
}
