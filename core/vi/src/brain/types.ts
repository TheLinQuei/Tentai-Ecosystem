/**
 * Cognition Pipeline Types
 * Describes the internal state machine for Vi's brain:
 * Perception → Intent → Planning → Execution → Reflection
 */

import type { Citation } from '../schema/Citation.js';
import type { UserProfile } from './profile.js';
import type { SelfModel } from '../config/selfModel.js';

// Re-export Citation for convenience
export type { Citation };

/**
 * Thought state represents a single turn through the cognition pipeline.
 * Immutable; each stage produces a new state object.
 */
export interface ThoughtState {
  id: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  stage: 'init' | 'perceived' | 'intent_classified' | 'planned' | 'executed' | 'reflected';
  input: string;
  perception?: Perception;
  intent?: Intent;
  plan?: Plan;
  execution?: Execution;
  reflection?: Reflection;
  metadata?: Record<string, unknown>;
}

/**
 * Cognition event emitted during streaming (Phase 6)
 */
export interface CognitionEvent<T = unknown> {
  type: 'perception' | 'intent' | 'plan' | 'execution' | 'reflection' | 'response' | 'ambiguity_detected';
  payload: T;
  timestamp: string;
}

/**
 * Perception: raw input + context extraction
 */
export interface Perception {
  raw: string;
  context: {
    conversationId?: string;
    recentHistory?: string[];
    immediateContext?: string[];  // Last 2 turns for stronger weighting
    personalIdentifiers?: string[];  // Names, nicknames extracted from history
    userPreferences?: Record<string, unknown>;
    retrievedMemories?: any[]; // Memories retrieved from MemoryStore
    userProfile?: UserProfile;
    selfModel?: SelfModel;
    continuityPack?: any; // Cross-session memory + preferences (C1+C6)
    canonContext?: any; // Lore-relevant facts from Astralis Codex (C3)
    bond?: { trust: number; familiarity: number; rapport: number; interactionCount: number };
  };
  confidence: number;
}

/**
 * Intent: classified user intent and desired outcome
 */
export interface Intent {
  category: 'query' | 'command' | 'conversation' | 'clarification' | 'feedback' | 'unknown';
  description?: string;
  entities?: Record<string, string>;
  confidence: number;
  reasoning?: string;
  requiresTooling?: boolean;
  requiresMemory?: boolean;
}

/**
 * Plan: deterministic sequence of steps to fulfill intent
 */
export interface Plan {
  steps: PlanStep[];
  reasoning: string;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  toolsNeeded: string[];
  memoryAccessNeeded: boolean;
}

/**
 * A single step in the plan (may be a tool call, memory access, etc.)
 */
export interface PlanStep {
  id: string;
  type: 'respond' | 'tool_call' | 'memory_access' | 'policy_check';
  description: string;
  params?: Record<string, unknown>;
  /** Optional tool identifier for tool_call steps */
  toolName?: string;
  /** Optional tool parameters for tool_call steps */
  toolParams?: Record<string, unknown>;
  /** Selector reasoning for debugging */
  toolReasoning?: string;
  dependencies?: string[];
  fallback?: PlanStep;
  /** Verification expectations for this step (Phase 5: Verified Actions) */
  verification?: {
    expected?: unknown;
    verifierType?: string;
    required?: boolean;
  };
}

/**
 * Execution: results of carrying out the plan
 */
export interface Execution {
  stepsExecuted: ExecutionResult[];
  success: boolean;
  output: string;
  toolResults?: ToolCallResult[];
  memoryUsed?: boolean;
  errors?: string[];
   verificationSummary?: {
    verified: number;
    failed: number;
    skipped: number;
  };
}

/**
 * Reflection deltas capture recovery attempts (Phase 4 self-correction)
 */
export interface ReflectionDelta {
  attempts: number;
  recovered: boolean;
  originalErrors?: string[];
  fallbackPlanApplied?: boolean;
  notes?: string[];
}

/**
 * Result of executing a single plan step
 */
export interface ExecutionResult {
  stepId: string;
  type: string;
  duration: number; // ms
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Tool call and result with citation support
 */
export interface ToolCallResult {
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status?: 'success' | 'failure' | 'timeout' | 'permission_denied' | 'rate_limited';
  timestamp: Date;
  citations?: Citation[];  // Source attribution from tool result
  verification?: VerificationOutcome;
}

/**
 * Reflection: post-run analysis and storage recommendations
 */
export interface Reflection {
  summary: string;
  keyFindings: string[];
  confidenceInResponse: number;
  memoryToStore?: MemoryRecord[];
  policyDecisions?: PolicyDecision[];
  nextStepSuggestions?: string[];
  delta?: ReflectionDelta;
}

/**
 * Tool verification outcome (Phase 5: Verified Actions)
 */
export interface VerificationOutcome {
  status: 'verified' | 'failed' | 'skipped';
  verifier?: string;
  errors?: string[];
  details?: Record<string, unknown>;
}

/**
 * Memory record: what to store from this interaction
 */
export interface MemoryRecord {
  type: 'fact' | 'preference' | 'entity' | 'interaction' | 'context';
  content: string;
  userId: string;
  timestamp: Date;
  citations?: Citation[];  // Source attribution using vi-protocol Citation schema
  ttl?: number; // seconds; undefined = indefinite
}

/**
 * Policy decision: governance check or boundary enforcement
 */
export interface PolicyDecision {
  policyId: string;
  name: string;
  action: 'allow' | 'deny' | 'require_approval';
  reason: string;
  severity: 'info' | 'warn' | 'block';
}

/**
 * Run record: complete artifact from one cognition turn
 */
export interface RunRecord {
  thoughtStateId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  inputText: string;
  intent: Intent;
  planExecuted: Plan;
  executionResult: Execution;
  reflection: Reflection;
  /** Final assistant output returned to the user */
  assistantOutput?: string;
  /** Grounding citations attached to the response */
  citations?: Citation[];
  totalDuration: number; // ms
  success: boolean;
}

