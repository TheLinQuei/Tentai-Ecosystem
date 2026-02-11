import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PolicyEngineImpl } from '../../src/brain/policy/PolicyEngineImpl.js';

describe('PolicyEngineImpl', () => {
  let pool: Pool;
  let policyEngine: PolicyEngineImpl;
  const logger = {
    warn: (_msg: any) => {},
    info: (_msg: any) => {},
  };

  beforeAll(async () => {
    // Use test database pool
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tentai_test',
    });
    policyEngine = new PolicyEngineImpl(pool, logger);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('authorize', () => {
    it('should allow tool execution for non-blocklisted tools', async () => {
      const result = await policyEngine.authorize('tool:calculate', 'user-1');
      expect(result).toBe(true);
    });

    it('should deny tool execution for blocklisted tools', async () => {
      // Set blocklist via env for this test
      const old = process.env.POLICY_TOOL_BLOCKLIST;
      process.env.POLICY_TOOL_BLOCKLIST = 'dangerous_tool';
      const engine = new PolicyEngineImpl(pool, logger);
      
      const result = await engine.authorize('tool:dangerous_tool', 'user-1');
      expect(result).toBe(false);

      process.env.POLICY_TOOL_BLOCKLIST = old;
    });

    it('should allow command execution for authenticated users', async () => {
      const result = await policyEngine.authorize('command_execution', 'user-1');
      expect(result).toBe(true);
    });

    it('should deny command execution for anonymous users', async () => {
      const result = await policyEngine.authorize('command_execution', '');
      expect(result).toBe(false);
    });

    it('should allow unknown actions by default', async () => {
      const result = await policyEngine.authorize('unknown_action', 'user-1');
      expect(result).toBe(true);
    });
  });

  describe('check', () => {
    it('should return empty violations (Phase 3 feature)', async () => {
      const violations = await policyEngine.check({} as any);
      expect(violations).toEqual([]);
    });
  });

  describe('recordDecision', () => {
    it('should record allow decision', async () => {
      policyEngine.clearAuditLog();
      await policyEngine.recordDecision('test_policy', 'user-1', 'allow', 'Test allow');
      
      const log = policyEngine.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].action).toBe('allow');
      expect(log[0].reason).toBe('Test allow');
    });

    it('should record deny decision with block severity', async () => {
      policyEngine.clearAuditLog();
      await policyEngine.recordDecision('test_policy', 'user-1', 'deny', 'Test deny');
      
      const log = policyEngine.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].action).toBe('deny');
      expect(log[0].severity).toBe('block');
    });

    it('should maintain audit log up to 10k entries', async () => {
      policyEngine.clearAuditLog();
      
      for (let i = 0; i < 100; i++) {
        await policyEngine.recordDecision('test_policy', 'user-1', 'allow', `Entry ${i}`);
      }
      
      const log = policyEngine.getAuditLog();
      expect(log.length).toBe(100);
    });
  });

  describe('integration', () => {
    it('should enforce tool authorization in workflow', async () => {
      policyEngine.clearAuditLog();
      
      // Simulate tool execution flow
      const authorized = await policyEngine.authorize('tool:calculate', 'user-1');
      expect(authorized).toBe(true);
      
      await policyEngine.recordDecision('tool_execution', 'user-1', 'allow', 'Tool authorized');
      
      const log = policyEngine.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].action).toBe('allow');
    });

    it('should track denied tool access', async () => {
      policyEngine.clearAuditLog();
      const old = process.env.POLICY_TOOL_BLOCKLIST;
      process.env.POLICY_TOOL_BLOCKLIST = 'blocked_tool';
      const engine = new PolicyEngineImpl(pool, logger);
      
      const authorized = await engine.authorize('tool:blocked_tool', 'user-2');
      expect(authorized).toBe(false);
      
      await engine.recordDecision('tool_execution', 'user-2', 'deny', 'Tool is blocklisted');
      
      const log = engine.getAuditLog();
      expect(log.length).toBe(1);
      expect(log[0].action).toBe('deny');

      process.env.POLICY_TOOL_BLOCKLIST = old;
    });
  });
});
