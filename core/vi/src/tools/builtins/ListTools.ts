/**
 * ListTools: Meta-tool that lists available tools
 */

import { Tool, JSONSchema, ToolExecutionContext } from '../types.js';

const listToolsSchema: JSONSchema = {
  type: 'object',
  properties: {
    category: {
      type: 'string',
      description: 'Filter by category (search, compute, file, system, api, memory, meta)',
    },
    includeDisabled: {
      type: 'string',
      description: 'Include disabled tools (true/false)',
    },
  },
};

export const ListToolsTool: Tool = {
  name: 'list_tools',
  category: 'meta',
  version: '1.0.0',
  description: 'List all available tools in the system',
  longDescription:
    'Returns metadata about all registered tools. Can be filtered by category. Useful when you want to know what operations are available.',
  examples: [
    {
      input: {},
      output: [
        {
          name: 'get_current_time',
          category: 'system',
          description: 'Get the current system time',
        },
      ],
    },
  ],
  inputSchema: listToolsSchema,
  permissions: [],
  rateLimit: { callsPerMinute: 100 },
  cost: { creditsPerExecution: 0 },
  timeout: { milliseconds: 5000 },
  isEnabled: true,

  async execute(
    parameters: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<any> {
    // Import here to avoid circular dependency
    const { getToolRegistry } = await import('../registry');
    const registry = getToolRegistry();

    let tools = registry.listMetadata();

    // Filter by category if specified
    const category = parameters.category as string | undefined;
    if (category) {
      tools = tools.filter(t => t.category === category);
    }

    // Filter disabled tools if requested
    const includeDisabled = (parameters.includeDisabled as string) === 'true';
    if (!includeDisabled) {
      tools = tools.filter(t => t.isEnabled);
    }

    return tools.map(tool => ({
      name: tool.name,
      category: tool.category,
      description: tool.description,
      isEnabled: tool.isEnabled,
      permissions: tool.permissions,
    }));
  },
};
