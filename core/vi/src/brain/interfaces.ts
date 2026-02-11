/**
 * Cognition Pipeline Interfaces
 * Abstractions for LLM, memory, tools, and policy engine.
 * These are boundaries where Phase 2+ will plug in real implementations.
 */

import {
  ThoughtState,
  Intent,
  Plan,
  RunRecord,
  Citation,
} from './types.js';

/**
 * LLMGateway: abstraction for language model interaction
 * Phase 1: stub that returns deterministic responses
 * Phase 2: wire to OpenAI, Anthropic, or local LLM
 */
export interface LLMGateway {
  /**
   * Classify user intent from raw text
   */
  classifyIntent(input: string, context?: Record<string, unknown>): Promise<Intent>;

  /**
   * Generate a plan to fulfill an intent
   */
  generatePlan(intent: Intent, context?: Record<string, unknown>): Promise<Plan>;

  /**
   * Generate final response text
   */
  generateResponse(thought: ThoughtState): Promise<string>;
}

/**
 * MemoryStore: abstraction for episodic and semantic memory
 * Phase 1: stub; later backed by vector DB + retrieval strategy
 */
export interface MemoryStore {
  /**
   * Store a memory record from this interaction
   */
  store(record: {
    userId: string;
    sessionId?: string;
    type: 'episodic' | 'semantic';
    subtype: string;
    text: string;
    metadata?: Record<string, unknown>;
  }): Promise<string>;

  /**
   * Retrieve relevant memories for context
   */
  retrieve(query: string, userId: string, limit?: number): Promise<any[]>;
}

/**
 * ToolRunner: abstraction for safe tool execution
 * Phase 1: no-op; Phase 2+ executes registered tools with audit
 */
export interface ToolRunner {
  /**
   * Execute a named tool with given input and execution context
   */
  execute(
    toolName: string,
    input: Record<string, unknown>,
    context: { userId: string; sessionId?: string; timestamp?: Date }
  ): Promise<{ success: boolean; data?: unknown; error?: string; status?: string }>;

  /**
   * List available tools
   */
  listAvailable(): Promise<string[]>;
}

/**
 * PolicyEngine: enforce guardrails and boundaries
 * Rate limits, permission checks, content policies, etc.
 */
export interface PolicyEngine {
  /**
   * Check if an action is allowed
   */
  authorize(action: string, userId: string): Promise<boolean>;

  /**
   * Get policy violations for a thought state
   */
  check(thought: ThoughtState): Promise<PolicyViolation[]>;

  /**
   * Record a policy decision
   */
  recordDecision(
    policyId: string,
    userId: string,
    action: 'allow' | 'deny' | 'require_approval',
    reason: string
  ): Promise<void>;
}

/**
 * Policy violation: a rule that was broken or needs review
 */
export interface PolicyViolation {
  policyId: string;
  name: string;
  severity: 'info' | 'warn' | 'block';
  reason: string;
  action: 'allow' | 'deny' | 'require_approval';
}

/**
 * RunRecordStore: persistence for cognition artifacts
 * Allows replaying, auditing, and learning from past interactions
 */
export interface RunRecordStore {
  /**
   * Save a complete run record
   */
  save(record: RunRecord): Promise<string>;

  /**
   * Retrieve a run record by ID
   */
  get(recordId: string): Promise<RunRecord | null>;

  /**
   * List all run records for a user
   */
  listByUser(userId: string, limit?: number): Promise<RunRecord[]>;

  /**
   * List all run records for a session
   */
  listBySession(sessionId: string): Promise<RunRecord[]>;

  /**
   * Persist citations associated with a run record (optional implementation)
   */
  saveCitations?(runRecordId: string, citations: Citation[]): Promise<void>;

  /**
   * Retrieve citations for a run record (optional implementation)
   */
  getCitationsByRunRecordId?(runRecordId: string): Promise<Citation[]>;
}
