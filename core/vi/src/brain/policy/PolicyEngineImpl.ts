import { PolicyEngine, PolicyViolation } from '../interfaces.js';
import { ThoughtState, PolicyDecision } from '../types.js';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';

/**
 * Production-grade PolicyEngine with rule-based enforcement and audit logging.
 * Rules:
 * - Tool execution: allowed by default; deny if tool is in blocklist
 * - Command execution: allowed by default for authenticated users
 * - Memory access: allowed for self; denied for cross-user access (future)
 * - Content checks: deferred to Phase 3 (content filtering)
 */
export class PolicyEngineImpl implements PolicyEngine {
  private toolBlocklist: Set<string> = new Set();
  private auditLog: PolicyDecision[] = [];

  constructor(
    private pool: Pool,
    private logger?: { warn: (...args: any[]) => void; info: (...args: any[]) => void }
  ) {
    // Initialize default rules
    // Example: add "dangerous_tool" to blocklist via env if needed
    const blocklistedTools = process.env.POLICY_TOOL_BLOCKLIST?.split(',') || [];
    blocklistedTools.forEach((t) => this.toolBlocklist.add(t.trim()));
  }

  async authorize(action: string, userId: string): Promise<boolean> {
    // Rule 1: Tool execution authorization
    if (action.startsWith('tool:')) {
      const toolName = action.substring(5);
      const blocked = this.toolBlocklist.has(toolName);
      if (blocked) {
        this.logger?.warn(`[Policy] Tool '${toolName}' is blocklisted for user ${userId}`);
        return false;
      }
      return true;
    }

    // Rule 2: Command execution authorization (allow for authenticated users)
    if (action === 'command_execution') {
      return !!userId; // Allow if userId is present
    }

    // Rule 3: Default: allow
    return true;
  }

  async check(_thought: ThoughtState): Promise<PolicyViolation[]> {
    // Content checks deferred to Phase 3
    // For now, return empty violations (all pass)
    return [];
  }

  async recordDecision(
    policyId: string,
    userId: string,
    action: 'allow' | 'deny' | 'require_approval',
    reason: string
  ): Promise<void> {
    const decisionId = randomUUID();
    const decision: PolicyDecision = {
      policyId,
      name: policyId,
      action,
      reason,
      severity: action === 'deny' ? 'block' : 'info',
    };

    // Store in local audit log (in-memory for now)
    this.auditLog.push(decision);
    if (this.auditLog.length > 10000) {
      this.auditLog.shift(); // Keep recent decisions
    }

    // Attempt to persist to database (best-effort, non-blocking)
    try {
      await this.pool.query(
        `INSERT INTO policy_audit (id, user_id, policy_id, decision, reason, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [decisionId, userId, policyId, action, reason]
      ).catch(() => {
        // Table may not exist yet; log warning but continue
        this.logger?.warn(`[Policy] Failed to persist decision ${decisionId} to audit log`);
      });
    } catch (error) {
      // Non-blocking; continue
    }

    // Emit telemetry for deny decisions
    if (action === 'deny') {
      this.logger?.warn(`[Policy Denied] User ${userId}: ${policyId} – ${reason}`);
    } else if (action === 'allow') {
      this.logger?.info(`[Policy Allowed] User ${userId}: ${policyId}`);
    }
  }

  /**
   * Get recent audit log (for testing/debugging)
   */
  getAuditLog(): PolicyDecision[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log (for testing)
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }
}
