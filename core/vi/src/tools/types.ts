/**
 * Tool System Type Definitions
 * 
 * Core types for Vi's tool execution framework:
 * - Tool: interface defining tool contract
 * - ToolResult: execution outcome with audit data
 * - ToolSelection: decision of which tool to use
 * - ToolRegistry: mapping of name -> Tool
 * - Citation: source attribution for tool results
 */

import type { Citation } from '../schema/Citation.js';

/**
 * JSON Schema representation for tool parameters.
 * Allows validation of inputs against structured schema.
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: JSONSchema;
}

/**
 * Permission categories that tools may require.
 * Checked before tool execution to enforce security boundaries.
 */
export type ToolPermission = 
  | 'memory'              // Access user's memory (semantic/episodic)
  | 'network'             // Make external API calls
  | 'filesystem'          // Read/write files
  | 'shell'               // Execute shell commands
  | 'calendar'            // Access calendar events
  | 'email'               // Send email
  | 'compute'             // CPU-intensive operations
  | 'user_context';       // Read user profile/preferences

/**
 * Tool categorization for discovery and filtering.
 */
export type ToolCategory =
  | 'search'              // Information retrieval (memory, web)
  | 'compute'             // Calculations, analysis
  | 'file'                // File operations
  | 'system'              // System queries
  | 'api'                 // External API calls
  | 'memory'              // Memory operations (consolidation, recall)
  | 'meta';               // Meta-tools (list_tools, get_status)

/**
 * Core Tool Interface
 * All tools must implement this contract.
 */
export interface Tool {
  // Identification
  name: string;                    // Unique identifier (e.g., "search_memory", "get_weather")
  category: ToolCategory;
  version: string;                 // SemVer (e.g., "1.0.0")
  
  // Documentation
  description: string;             // What this tool does (for LLM selection + UX)
  longDescription?: string;        // Detailed explanation with examples
  examples?: Array<{
    input: Record<string, unknown>;
    output: unknown;
  }>;
  
  // Input/Output Contracts
  inputSchema: JSONSchema;         // Parameters this tool accepts
  
  // Execution
  execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult>;
  
  // Governance
  permissions: ToolPermission[];   // Required capabilities
  rateLimit: {
    callsPerMinute: number;        // Max calls/minute per user
  };
  cost: {
    creditsPerExecution: number;   // Credits deducted per call
  };
  timeout: {
    milliseconds: number;          // Max execution time
  };
  
  // Metadata
  deprecationWarning?: string;     // If deprecated, warn users
  isEnabled: boolean;              // Can be disabled without removing from registry
}

/**
 * Context passed to tool during execution.
 * Provides access to user info, memory, etc.
 */
export interface ToolExecutionContext {
  userId: string;
  userName?: string;
  sessionId: string;
  timestamp: Date;
  
  // Future: pass in memory access, user context, etc.
  // memoryStore?: MemoryStore;
  // userContext?: UserProfile;
}

/**
 * Result of tool execution with full audit trail and citations.
 */
export interface ToolResult {
  // Core outcome
  success: boolean;
  data?: unknown;                  // Payload if successful
  error?: string;                  // Error message if failed
  
  // Audit trail
  toolName: string;
  parameters: Record<string, unknown>;
  executionTimeMs: number;
  costApplied: number;             // Credits deducted
  timestamp: Date;
  
  // Status details
  status: 'success' | 'failure' | 'timeout' | 'permission_denied' | 'rate_limited';
  
  // Citations: source attribution for this result
  citations?: Citation[];          // Linked via vi-protocol; identifies data sources
  
  // Additional context
  warnings?: string[];             // Non-fatal issues
}

/**
 * Decision of which tool to use and what parameters.
 * Used by selector to match intent -> tool.
 */
export interface ToolSelection {
  toolName: string;
  parameters: Record<string, unknown>;
  confidence: number;              // 0.0 to 1.0 (how confident about this selection)
  reasoning?: string;              // Why this tool was chosen (for debugging + reflection)
  alternative?: ToolSelection;     // Fallback if primary fails
}

/**
 * Tool Registry: mapping of tool name -> Tool instance
 */
export type ToolRegistry = Map<string, Tool>;

/**
 * Metadata about registered tools for discovery.
 */
export interface ToolMetadata {
  name: string;
  category: ToolCategory;
  description: string;
  isEnabled: boolean;
  permissions: ToolPermission[];
}

/**
 * Tool usage statistics for rate limiting + cost tracking.
 */
export interface ToolUsageStats {
  userId: string;
  toolName: string;
  callCount: number;              // Total calls by this user
  callsInCurrentMinute: number;   // For rate limiting
  totalCreditsSpent: number;
  lastCallTime: Date;
  averageExecutionTimeMs: number;
}
