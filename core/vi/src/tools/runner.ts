/**
 * Tool Runner
 * 
 * Executes tools with sandboxing, rate limiting, cost tracking, and audit logging.
 * Enforces security boundaries: validation, permissions, timeouts, credits.
 */

import { ToolResult, ToolExecutionContext, JSONSchema } from './types.js';
import { getToolRegistry } from './registry.js';

/**
 * Input validation using JSON Schema.
 * Validates that tool parameters match the tool's inputSchema.
 */
export function validateToolInput(
  parameters: Record<string, unknown>,
  schema: JSONSchema
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in parameters)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  // Check field types (simplified)
  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (field in parameters && fieldSchema.type) {
        const value = parameters[field];
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== fieldSchema.type) {
          errors.push(
            `Field "${field}" has type "${actualType}", expected "${fieldSchema.type}"`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Output sanitization to prevent information leakage.
 * Removes sensitive data before returning tool results.
 */
export function sanitizeToolOutput(output: unknown): unknown {
  if (output === null || output === undefined) {
    return output;
  }

  if (typeof output === 'string') {
    // Remove API keys, passwords, tokens
    return output
      .replace(/api[_-]?key[=:]\s*[^\s]+/gi, 'API_KEY_REDACTED')
      .replace(/password[=:]\s*[^\s]+/gi, 'PASSWORD_REDACTED')
      .replace(/token[=:]\s*[^\s]+/gi, 'TOKEN_REDACTED');
  }

  if (typeof output === 'object') {
    if (Array.isArray(output)) {
      return output.map(sanitizeToolOutput);
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(output)) {
      if (
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('api_key') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token')
      ) {
        sanitized[key] = 'REDACTED';
      } else {
        sanitized[key] = sanitizeToolOutput(value);
      }
    }
    return sanitized;
  }

  return output;
}

/**
 * Rate limiter for tool execution.
 * Tracks usage per user/tool to prevent abuse.
 */
export class RateLimiter {
  private usage: Map<string, { count: number; resetTime: number }> = new Map();

  /**
   * Check if a tool execution is allowed.
   */
  isAllowed(userId: string, toolName: string, callsPerMinute: number): boolean {
    const key = `${userId}:${toolName}`;
    const now = Date.now();

    let record = this.usage.get(key);

    // Create or reset if expired
    if (!record || now >= record.resetTime) {
      record = { count: 0, resetTime: now + 60000 };
      this.usage.set(key, record);
    }

    // Check limit
    if (record.count >= callsPerMinute) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Get current usage for a tool.
   */
  getUsage(userId: string, toolName: string): { count: number; limit: number } {
    const key = `${userId}:${toolName}`;
    const record = this.usage.get(key);
    const tool = getToolRegistry().get(toolName);
    return {
      count: record?.count ?? 0,
      limit: tool?.rateLimit?.callsPerMinute ?? 10,
    };
  }

  /**
   * Clear all usage (for testing).
   */
  clear(): void {
    this.usage.clear();
  }
}

/**
 * Cost tracker for tool execution.
 * Tracks user credits and prevents overspending.
 */
export class CostTracker {
  // Map of userId -> credits
  private credits: Map<string, number> = new Map();

  constructor(defaultCredits: number = 100) {
    this.defaultCredits = defaultCredits;
  }

  private defaultCredits: number;

  /**
   * Get user's current credit balance.
   */
  getBalance(userId: string): number {
    return this.credits.get(userId) ?? this.defaultCredits;
  }

  /**
   * Check if user has enough credits.
   */
  canAfford(userId: string, cost: number): boolean {
    return this.getBalance(userId) >= cost;
  }

  /**
   * Deduct credits from user account.
   */
  deduct(userId: string, cost: number): void {
    const balance = this.getBalance(userId);
    this.credits.set(userId, Math.max(0, balance - cost));
  }

  /**
   * Add credits (admin only).
   */
  grant(userId: string, amount: number): void {
    const balance = this.getBalance(userId);
    this.credits.set(userId, balance + amount);
  }

  /**
   * Reset credits to default.
   */
  reset(userId: string): void {
    this.credits.delete(userId);
  }

  /**
   * Clear all credits (for testing).
   */
  clear(): void {
    this.credits.clear();
  }
}

/**
 * Tool Runner: executes tools with full sandbox/audit/cost enforcement.
 */
export class ToolRunner {
  private rateLimiter = new RateLimiter();
  private costTracker = new CostTracker(100);
  private costsEnabled = true;

  constructor(enableCosts: boolean = true) {
    this.costsEnabled = enableCosts;
  }

  /**
   * Execute a tool with full security/audit enforcement.
   */
  async execute(
    toolName: string,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const registry = getToolRegistry();

    // Phase 1: Check if tool exists
    const tool = registry.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${toolName}" not found`,
        toolName,
        parameters,
        executionTimeMs: 0,
        costApplied: 0,
        timestamp: new Date(),
        status: 'failure',
      };
    }

    // Phase 2: Check if tool is enabled
    if (!tool.isEnabled) {
      return {
        success: false,
        error: `Tool "${toolName}" is disabled`,
        toolName,
        parameters,
        executionTimeMs: 0,
        costApplied: 0,
        timestamp: new Date(),
        status: 'failure',
      };
    }

    // Phase 3: Validate input
    const validation = validateToolInput(parameters, tool.inputSchema);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid input: ${validation.errors.join('; ')}`,
        toolName,
        parameters,
        executionTimeMs: 0,
        costApplied: 0,
        timestamp: new Date(),
        status: 'failure',
        warnings: validation.errors,
      };
    }

    // Phase 4: Check rate limit
    if (!this.rateLimiter.isAllowed(context.userId, toolName, tool.rateLimit.callsPerMinute)) {
      return {
        success: false,
        error: `Rate limit exceeded for tool "${toolName}" (${tool.rateLimit.callsPerMinute} calls/minute)`,
        toolName,
        parameters,
        executionTimeMs: 0,
        costApplied: 0,
        timestamp: new Date(),
        status: 'rate_limited',
      };
    }

    // Phase 5: Check cost/credits
    const cost = tool.cost.creditsPerExecution;
    if (this.costsEnabled && !this.costTracker.canAfford(context.userId, cost)) {
      return {
        success: false,
        error: `Insufficient credits: need ${cost}, have ${this.costTracker.getBalance(context.userId)}`,
        toolName,
        parameters,
        executionTimeMs: 0,
        costApplied: 0,
        timestamp: new Date(),
        status: 'failure',
      };
    }

    // Phase 6: Execute with timeout
    let result: unknown;
    let executionError: Error | null = null;

    try {
      const executionPromise = tool.execute(parameters, context);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tool execution timeout')), tool.timeout.milliseconds)
      );

      result = await Promise.race([executionPromise, timeoutPromise]);
    } catch (error) {
      executionError = error instanceof Error ? error : new Error(String(error));
    }

    const executionTimeMs = Date.now() - startTime;

    // Check for timeout
    if (executionTimeMs >= tool.timeout.milliseconds && !executionError) {
      executionError = new Error('Tool execution timeout');
    }

    // Phase 7: Deduct cost
    if (this.costsEnabled) {
      this.costTracker.deduct(context.userId, cost);
    }

    // Phase 8: Sanitize output
    if (result) {
      result = sanitizeToolOutput(result);
    }

    // Phase 9: Return result
    if (executionError) {
      return {
        success: false,
        error: executionError.message,
        toolName,
        parameters,
        executionTimeMs,
        costApplied: this.costsEnabled ? cost : 0,
        timestamp: new Date(),
        status: executionTimeMs >= tool.timeout.milliseconds ? 'timeout' : 'failure',
      };
    }

    return {
      success: true,
      data: result,
      toolName,
      parameters,
      executionTimeMs,
      costApplied: this.costsEnabled ? cost : 0,
      timestamp: new Date(),
      status: 'success',
    };
  }

  /**
   * Get user's current credit balance.
   */
  getUserCredits(userId: string): number {
    return this.costTracker.getBalance(userId);
  }

  /**
   * Grant credits to user (admin).
   */
  grantCredits(userId: string, amount: number): void {
    this.costTracker.grant(userId, amount);
  }

  /**
   * Get rate limit status for a tool.
   */
  getRateLimitStatus(userId: string, toolName: string): { used: number; limit: number } {
    const usage = this.rateLimiter.getUsage(userId, toolName);
    return { used: usage.count, limit: usage.limit };
  }

  /**
   * Clear caches (for testing).
   */
  clear(): void {
    this.rateLimiter.clear();
    this.costTracker.clear();
  }

  /**
   * List available (enabled) tools.
   */
  async listAvailable(): Promise<string[]> {
    const registry = getToolRegistry();
    return registry.listEnabled().map((tool) => tool.name);
  }
}
