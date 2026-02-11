/**
 * Tool System Unit Tests
 * 
 * Tests for tool registry, selector, runner, and built-in tools
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ToolRegistryImpl,
  getToolRegistry,
  resetToolRegistry,
} from '../../src/tools/registry';
import {
  ToolSelector,
} from '../../src/tools/selector';
import {
  ToolRunner,
  validateToolInput,
  sanitizeToolOutput,
  RateLimiter,
  CostTracker,
} from '../../src/tools/runner';
import { Tool, ToolExecutionContext } from '../../src/tools/types';
import { initializeBuiltinTools } from '../../src/tools/builtins/index';

describe('Tool Registry', () => {
  beforeEach(() => {
    resetToolRegistry();
  });

  it('should register and retrieve tools', () => {
    const registry = getToolRegistry();

    const mockTool: Tool = {
      name: 'test_tool',
      category: 'meta',
      version: '1.0.0',
      description: 'Test tool',
      inputSchema: { type: 'object' },
      permissions: [],
      rateLimit: { callsPerMinute: 10 },
      cost: { creditsPerExecution: 1 },
      timeout: { milliseconds: 5000 },
      isEnabled: true,
      execute: async () => ({ success: true }),
    };

    registry.register(mockTool);
    const retrieved = registry.get('test_tool');

    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('test_tool');
  });

  it('should prevent duplicate registrations', () => {
    const registry = getToolRegistry();

    const tool: Tool = {
      name: 'test_tool',
      category: 'meta',
      version: '1.0.0',
      description: 'Test',
      inputSchema: { type: 'object' },
      permissions: [],
      rateLimit: { callsPerMinute: 10 },
      cost: { creditsPerExecution: 1 },
      timeout: { milliseconds: 5000 },
      isEnabled: true,
      execute: async () => ({ success: true }),
    };

    registry.register(tool);
    expect(() => registry.register(tool)).toThrow(/already registered/);
  });

  it('should list all tools', () => {
    const registry = getToolRegistry();
    initializeBuiltinTools();

    const tools = registry.list();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.name === 'list_tools')).toBe(true);
  });

  it('should search tools by keyword', () => {
    const registry = getToolRegistry();
    initializeBuiltinTools();

    const results = registry.search('time');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(t => t.name === 'get_current_time')).toBe(true);
  });

  it('should filter tools by category', () => {
    const registry = getToolRegistry();
    initializeBuiltinTools();

    const meta = registry.byCategory('meta');
    expect(meta.length).toBeGreaterThan(0);
    expect(meta.every(t => t.category === 'meta')).toBe(true);
  });
});

describe('Tool Selector', () => {
  beforeEach(() => {
    resetToolRegistry();
    initializeBuiltinTools();
  });

  it('should suggest tools based on intent', () => {
    const intent = {
      category: 'query' as const,
      description: 'what time is it',
      confidence: 0.9,
    };

    const selection = ToolSelector.selectForIntent(intent);
    expect(selection).toBeDefined();
    expect(selection?.toolName).toBe('get_current_time');
  });

  it('should select tool by name', () => {
    const selection = ToolSelector.selectByName('list_tools');
    expect(selection).toBeDefined();
    expect(selection?.toolName).toBe('list_tools');
    expect(selection?.confidence).toBe(1.0);
  });

  it('should return null for unknown tool', () => {
    const selection = ToolSelector.selectByName('nonexistent_tool');
    expect(selection).toBeNull();
  });

  it('should suggest tools by query', () => {
    const suggestions = ToolSelector.suggestTools('time');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some(s => s.toolName === 'get_current_time')).toBe(true);
  });
});

describe('Tool Validation & Sanitization', () => {
  it('should validate tool inputs', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        age: { type: 'string' },
      },
      required: ['name'],
    };

    // Valid input
    const validResult = validateToolInput({ name: 'Alice', age: '30' }, schema);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);

    // Missing required field
    const invalidResult = validateToolInput({ age: '30' }, schema);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  it('should sanitize sensitive output', () => {
    const output = {
      status: 'ok',
      api_key: 'sk-1234567890',
      password: 'secret123',
      data: 'public info',
    };

    const sanitized = sanitizeToolOutput(output) as Record<string, unknown>;
    expect(sanitized.api_key).toBe('REDACTED');
    expect(sanitized.password).toBe('REDACTED');
    expect(sanitized.data).toBe('public info');
  });

  it('should sanitize nested sensitive data', () => {
    const output = {
      user: {
        name: 'Alice',
        password: 'secret',
      },
      token: 'abc123',
    };

    const sanitized = sanitizeToolOutput(output) as Record<string, unknown>;
    const user = sanitized.user as Record<string, unknown>;
    expect(user.password).toBe('REDACTED');
    expect(sanitized.token).toBe('REDACTED');
  });
});

describe('Rate Limiting', () => {
  it('should enforce rate limits', () => {
    const limiter = new RateLimiter();

    // First 5 calls allowed
    for (let i = 0; i < 5; i++) {
      expect(limiter.isAllowed('user-1', 'test_tool', 5)).toBe(true);
    }

    // 6th call denied
    expect(limiter.isAllowed('user-1', 'test_tool', 5)).toBe(false);
  });

  it('should track usage per user', () => {
    const limiter = new RateLimiter();

    expect(limiter.isAllowed('user-1', 'tool', 3)).toBe(true);
    expect(limiter.isAllowed('user-2', 'tool', 3)).toBe(true);
    expect(limiter.isAllowed('user-1', 'tool', 3)).toBe(true);
    expect(limiter.isAllowed('user-1', 'tool', 3)).toBe(true);
    expect(limiter.isAllowed('user-1', 'tool', 3)).toBe(false); // user-1 limit hit

    expect(limiter.isAllowed('user-2', 'tool', 3)).toBe(true); // user-2 still has quota
  });
});

describe('Cost Tracking', () => {
  it('should track user credits', () => {
    const tracker = new CostTracker(100);

    expect(tracker.getBalance('user-1')).toBe(100);
    expect(tracker.canAfford('user-1', 50)).toBe(true);

    tracker.deduct('user-1', 30);
    expect(tracker.getBalance('user-1')).toBe(70);

    tracker.deduct('user-1', 70);
    expect(tracker.getBalance('user-1')).toBe(0);

    expect(tracker.canAfford('user-1', 1)).toBe(false);
  });

  it('should grant credits', () => {
    const tracker = new CostTracker(50);

    tracker.grant('user-1', 50);
    expect(tracker.getBalance('user-1')).toBe(100);
  });
});

describe('Tool Runner', () => {
  beforeEach(() => {
    resetToolRegistry();
    initializeBuiltinTools();
  });

  it('should execute a simple tool', async () => {
    const runner = new ToolRunner(false); // Disable costs for testing
    const context: ToolExecutionContext = {
      userId: 'user-1',
      sessionId: 'session-1',
      timestamp: new Date(),
    };

    const result = await runner.execute('get_current_time', {}, context);

    expect(result.success).toBe(true);
    expect(result.toolName).toBe('get_current_time');
    expect(result.status).toBe('success');
    expect((result.data as any).iso).toBeDefined();
  });

  it('should fail for nonexistent tool', async () => {
    const runner = new ToolRunner(false);
    const context: ToolExecutionContext = {
      userId: 'user-1',
      sessionId: 'session-1',
      timestamp: new Date(),
    };

    const result = await runner.execute('nonexistent', {}, context);

    expect(result.success).toBe(false);
    expect(result.status).toBe('failure');
    expect(result.error).toContain('not found');
  });

  it('should validate tool input', async () => {
    const runner = new ToolRunner(false);
    const context: ToolExecutionContext = {
      userId: 'user-1',
      sessionId: 'session-1',
      timestamp: new Date(),
    };

    // calculate requires 'expression' parameter
    const result = await runner.execute('calculate', {}, context);

    expect(result.success).toBe(false);
    expect(result.status).toBe('failure');
    expect(result.error).toContain('Invalid input');
  });

  it('should perform calculations correctly', async () => {
    const runner = new ToolRunner(false);
    const context: ToolExecutionContext = {
      userId: 'user-1',
      sessionId: 'session-1',
      timestamp: new Date(),
    };

    const result = await runner.execute('calculate', { expression: '2 + 2' }, context);

    expect(result.success).toBe(true);
    expect((result.data as any).result).toBe(4);
  });

  it('should list available tools', async () => {
    const runner = new ToolRunner(false);
    const context: ToolExecutionContext = {
      userId: 'user-1',
      sessionId: 'session-1',
      timestamp: new Date(),
    };

    const result = await runner.execute('list_tools', {}, context);

    expect(result.success).toBe(true);
    const tools = result.data as any[];
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.name === 'get_current_time')).toBe(true);
  });

  it('should enforce cost tracking', async () => {
    const runner = new ToolRunner(true); // Enable costs

    const context: ToolExecutionContext = {
      userId: 'user-1',
      sessionId: 'session-1',
      timestamp: new Date(),
    };

    // Default credits is 100, deduct to 2 to test edge case
    runner.grantCredits('user-1', -98);

    // First call uses 1 credit (SearchMemory costs 1)
    const result1 = await runner.execute('search_memory', { query: 'test' }, context);
    expect(result1.success).toBe(true);
    expect(runner.getUserCredits('user-1')).toBe(1); // 2 - 1 = 1

    // Second call uses another credit
    const result2 = await runner.execute('search_memory', { query: 'test' }, context);
    expect(result2.success).toBe(true);
    expect(runner.getUserCredits('user-1')).toBe(0); // 1 - 1 = 0

    // Third call should fail due to insufficient credits
    const result3 = await runner.execute('search_memory', { query: 'test' }, context);
    expect(result3.success).toBe(false);
    expect(result3.status).toBe('failure');
  });

  it('should track execution time', async () => {
    const runner = new ToolRunner(false);
    const context: ToolExecutionContext = {
      userId: 'user-1',
      sessionId: 'session-1',
      timestamp: new Date(),
    };

    const result = await runner.execute('get_current_time', {}, context);

    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.executionTimeMs).toBeLessThan(1000);
  });
});
