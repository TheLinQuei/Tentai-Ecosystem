/**
 * DeterministicEcho Tool
 * Returns a known value for testing tool grounding.
 * Used to verify tool output flows into final LLM response.
 */

import type { Tool, JSONSchema, ToolExecutionContext } from '../types.js';

const echoSchema: JSONSchema = {
  type: 'object',
  properties: {
    value: {
      type: 'string',
      description: 'Value to echo back',
    },
  },
  required: ['value'],
};

export const DeterministicEchoTool: Tool = {
  name: 'echo_test',
  category: 'meta',
  version: '1.0.0',
  description: 'Returns a deterministic value for testing (echo test)',
  longDescription: 'Echoes back a provided value with a known prefix. Used for verifying tool output integration.',
  examples: [
    {
      input: { value: 'test123' },
      output: { echo: 'DETERMINISTIC_ECHO:test123' },
    },
  ],
  inputSchema: echoSchema,
  permissions: [],
  rateLimit: { callsPerMinute: 100 },
  cost: { creditsPerExecution: 0 },
  timeout: { milliseconds: 100 },
  isEnabled: true,

  async execute(
    parameters: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<any> {
    const value = parameters.value as string;

    if (!value) {
      throw new Error('value parameter is required');
    }

    // Return deterministic output with known marker
    return {
      echo: `DETERMINISTIC_ECHO:${value}`,
      timestamp: new Date().toISOString(),
    };
  },
};
