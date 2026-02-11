/**
 * GetUserContext: Fetch user profile information
 */

import { Tool, JSONSchema, ToolExecutionContext } from '../types.js';

const getUserContextSchema: JSONSchema = {
  type: 'object',
  properties: {
    includePreferences: {
      type: 'string',
      description: 'Include user preferences (true/false, default: true)',
    },
  },
};

export const GetUserContextTool: Tool = {
  name: 'get_user_context',
  category: 'system',
  version: '1.0.0',
  description: 'Get current user context and preferences',
  longDescription: 'Returns information about the current user, including their profile and preferences. Helps personalize responses and decisions.',
  examples: [
    {
      input: {},
      output: {
        userId: 'user-123',
        name: 'Alice',
        timezone: 'America/New_York',
        preferences: {
          language: 'en',
          verbosity: 'medium',
        },
      },
    },
  ],
  inputSchema: getUserContextSchema,
  permissions: ['user_context'],
  rateLimit: { callsPerMinute: 100 },
  cost: { creditsPerExecution: 0 },
  timeout: { milliseconds: 1000 },
  isEnabled: true,

  async execute(
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<any> {
    const includePreferences = (parameters.includePreferences as string) !== 'false';

    // Phase 1: Return stub user context
    // Phase 2: Fetch from database user service
    const userContext: any = {
      userId: context.userId,
      userName: context.userName || 'User',
      sessionId: context.sessionId,
      currentTime: context.timestamp.toISOString(),
    };

    if (includePreferences) {
      userContext.preferences = {
        language: 'en',
        timezone: 'UTC',
        verbosity: 'medium',
        allowToolExecution: true,
      };
    }

    return userContext;
  },
};
