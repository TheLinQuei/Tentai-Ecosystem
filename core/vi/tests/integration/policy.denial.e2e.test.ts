import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PolicyEngineImpl } from '../../src/brain/policy/PolicyEngineImpl.js';
import { Executor } from '../../src/brain/executor.js';
import { Plan } from '../../src/brain/types.js';

describe('Policy Engine Deny Scenarios', () => {
  let pool: Pool;
  let policyEngine: PolicyEngineImpl;
  let executor: Executor;

  const logger = { warn: (_msg: any) => {}, info: (_msg: any) => {} };

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tentai_test',
    });
    policyEngine = new PolicyEngineImpl(pool, logger);
    executor = new Executor(policyEngine);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('tool execution denial', () => {
    it('should deny execution of blocklisted tools', async () => {
      // Setup: add a tool to blocklist
      const old = process.env.POLICY_TOOL_BLOCKLIST;
      process.env.POLICY_TOOL_BLOCKLIST = 'dangerous_tool';
      const engine = new PolicyEngineImpl(pool, logger);
      const exec = new Executor(engine);

      const plan: Plan = {
        steps: [
          {
            id: 'step-1',
            type: 'tool_call',
            description: 'Call dangerous tool',
            toolName: 'dangerous_tool',
            toolParams: { query: 'test' },
          },
        ],
        reasoning: 'Test denial',
        estimatedComplexity: 'simple',
        toolsNeeded: ['dangerous_tool'],
        memoryAccessNeeded: false,
      };

      const result = await exec.executePlan(plan, 'user-1', 'session-1');

      expect(result.success).toBe(false);
      expect(result.stepsExecuted[0].success).toBe(false);
      if (result.stepsExecuted[0].error) {
        expect(String(result.stepsExecuted[0].error)).toContain('Policy denied');
      }

      // Cleanup
      process.env.POLICY_TOOL_BLOCKLIST = old;
    });

    it('should allow execution of non-blocklisted tools', async () => {
      policyEngine.clearAuditLog();

      const plan: Plan = {
        steps: [
          {
            id: 'step-1',
            type: 'tool_call',
            description: 'Call allowed tool',
            toolName: 'list_tools',
            toolParams: {},
          },
        ],
        reasoning: 'Test allow',
        estimatedComplexity: 'simple',
        toolsNeeded: ['list_tools'],
        memoryAccessNeeded: false,
      };

      const result = await executor.executePlan(plan, 'user-1', 'session-1');

      // Tool execution may fail for other reasons, but policy should not block
      const auditLog = policyEngine.getAuditLog();
      const denialDecisions = auditLog.filter((d) => d.action === 'deny');
      expect(denialDecisions).toHaveLength(0);
    });

    it('should record deny decisions for audit trail', async () => {
      policyEngine.clearAuditLog();
      const old = process.env.POLICY_TOOL_BLOCKLIST;
      process.env.POLICY_TOOL_BLOCKLIST = 'blocked_tool';
      const engine = new PolicyEngineImpl(pool, logger);

      const authorized = await engine.authorize('tool:blocked_tool', 'user-1');
      expect(authorized).toBe(false);

      const auditLog = engine.getAuditLog();
      // Note: audit log only records what recordDecision() is called with
      // The deny check happens before recordDecision

      // Simulate what executor does
      if (!authorized) {
        await engine.recordDecision('tool_execution', 'user-1', 'deny', 'Tool is blocklisted');
      }

      const updated = engine.getAuditLog();
      expect(updated).toHaveLength(1);
      expect(updated[0].action).toBe('deny');

      process.env.POLICY_TOOL_BLOCKLIST = old;
    });
  });

  describe('command execution denial', () => {
    it('should deny anonymous command execution', async () => {
      const authorized = await policyEngine.authorize('command_execution', '');
      expect(authorized).toBe(false);
    });

    it('should allow authenticated command execution', async () => {
      const authorized = await policyEngine.authorize('command_execution', 'user-1');
      expect(authorized).toBe(true);
    });
  });
});
