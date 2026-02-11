/**
 * GetCurrentTime: Simple system tool
 */

import { Tool, JSONSchema } from '../types.js';

const getCurrentTimeSchema: JSONSchema = {
  type: 'object',
  properties: {
    format: {
      type: 'string',
      description: 'Output format: iso (default), unix, or readable',
    },
    timezone: {
      type: 'string',
      description: 'Timezone (e.g., UTC, America/New_York). Default: UTC',
    },
  },
};

export const GetCurrentTimeTool: Tool = {
  name: 'get_current_time',
  category: 'system',
  version: '1.0.0',
  description: 'Get the current system time',
  longDescription: 'Returns the current date and time in various formats. Useful for timestamp-dependent operations.',
  examples: [
    {
      input: { format: 'iso' },
      output: { time: '2025-12-24T10:30:45.123Z', unix: 1766384645123 },
    },
  ],
  inputSchema: getCurrentTimeSchema,
  permissions: [],
  rateLimit: { callsPerMinute: 1000 },
  cost: { creditsPerExecution: 0 },
  timeout: { milliseconds: 1000 },
  isEnabled: true,

  async execute(parameters: Record<string, unknown>): Promise<any> {
    const now = new Date();
    const format = (parameters.format as string) || 'iso';

    if (format === 'unix') {
      return { unix: now.getTime(), iso: now.toISOString() };
    }

    if (format === 'readable') {
      return {
        readable: now.toLocaleString(),
        iso: now.toISOString(),
        unix: now.getTime(),
      };
    }

    // Default: iso
    return {
      iso: now.toISOString(),
      unix: now.getTime(),
      utc: now.toUTCString(),
    };
  },
};
