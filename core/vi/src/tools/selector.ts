/**
 * Tool Selector
 * 
 * Determines which tool to use for a given intent.
 * Phase 1: Deterministic matching (intent category -> tool)
 * Phase 2: LLM-based selection (semantic matching)
 */

import { Intent } from '../brain/types.js';
import { ToolSelection } from './types.js';
import { getToolRegistry } from './registry.js';

/**
 * Tool selector using deterministic rules.
 * Maps intent categories and keywords to tools.
 */
export class ToolSelector {
  private static readonly INTENT_TO_TOOLS: Record<string, string[]> = {
    query: ['list_tools'],
    command: ['execute_command', 'send_email'],
    conversation: [],
    clarification: ['list_tools'],
    feedback: [],
    unknown: ['list_tools'],
  };

  private static readonly KEYWORD_TO_TOOLS: Record<string, string> = {
    'weather': 'get_weather',
    'time': 'get_current_time',
    'calculate': 'calculate',
    'math': 'calculate',
    'memory': 'search_memory',
    'search': 'search_memory',
    'remember': 'store_memory',
    'tools': 'list_tools',
    'help': 'list_tools',
    'compute': 'calculate',
  };

  /**
   * Select tool(s) for an intent using deterministic rules.
   * Returns primary selection + fallback.
   */
  static selectForIntent(intent: Intent): ToolSelection | null {
    const registry = getToolRegistry();

    // First try keyword matching
    const lowerDescription = intent.description?.toLowerCase() ?? '';
    for (const [keyword, toolName] of Object.entries(this.KEYWORD_TO_TOOLS)) {
      if (lowerDescription.includes(keyword)) {
        const tool = registry.get(toolName);
        if (tool && tool.isEnabled) {
          return {
            toolName,
            parameters: {},
            confidence: 0.9,
            reasoning: `Keyword "${keyword}" matches tool "${toolName}"`,
          };
        }
      }
    }

    // Fall back to intent category matching
    const toolNames = this.INTENT_TO_TOOLS[intent.category] || [];
    for (const toolName of toolNames) {
      const tool = registry.get(toolName);
      if (tool && tool.isEnabled) {
        return {
          toolName,
          parameters: {},
          confidence: 0.6,
          reasoning: `Intent category "${intent.category}" suggests "${toolName}"`,
        };
      }
    }

    // Default: offer list of tools
    const listTools = registry.get('list_tools');
    if (listTools?.isEnabled) {
      return {
        toolName: 'list_tools',
        parameters: {},
        confidence: 0.3,
        reasoning: 'No specific tool matched; listing available tools',
      };
    }

    return null;
  }

  /**
   * Select tool by name directly (when explicitly requested).
   */
  static selectByName(
    toolName: string,
    parameters: Record<string, unknown> = {}
  ): ToolSelection | null {
    const registry = getToolRegistry();
    const tool = registry.get(toolName);

    if (!tool) {
      return null;
    }

    if (!tool.isEnabled) {
      return null;
    }

    return {
      toolName,
      parameters,
      confidence: 1.0,
      reasoning: 'Explicitly requested',
    };
  }

  /**
   * Select tool by category.
   * Useful when executor wants tools in a specific category.
   */
  static selectByCategory(
    category: string,
    parameters: Record<string, unknown> = {}
  ): ToolSelection | null {
    const registry = getToolRegistry();
    const tools = registry.byCategory(category as any);
    
    if (tools.length === 0) {
      return null;
    }

    // Return first enabled tool in category
    const tool = tools.find(t => t.isEnabled);
    if (!tool) {
      return null;
    }

    return {
      toolName: tool.name,
      parameters,
      confidence: 0.7,
      reasoning: `Selected from "${category}" category`,
    };
  }

  /**
   * Suggest tools based on a search query.
   * Returns multiple candidates ranked by relevance.
   */
  static suggestTools(query: string): ToolSelection[] {
    const registry = getToolRegistry();
    const suggestions: ToolSelection[] = [];

    const enabledTools = registry.listEnabled();
    const lowerQuery = query.toLowerCase();

    // Exact name match (highest confidence)
    const exactMatch = enabledTools.find(t =>
      t.name.toLowerCase() === lowerQuery
    );
    if (exactMatch) {
      suggestions.push({
        toolName: exactMatch.name,
        parameters: {},
        confidence: 1.0,
        reasoning: 'Exact name match',
      });
    }

    // Keyword match in description
    const keywordMatches = enabledTools.filter(t =>
      t.description.toLowerCase().includes(lowerQuery) ||
      t.name.toLowerCase().includes(lowerQuery)
    );
    for (const tool of keywordMatches) {
      if (tool.name !== exactMatch?.name) {
        suggestions.push({
          toolName: tool.name,
          parameters: {},
          confidence: 0.8,
          reasoning: `Description contains "${query}"`,
        });
      }
    }

    return suggestions;
  }
}

/**
 * Tool selector interface (for dependency injection).
 */
export interface IToolSelector {
  selectForIntent(intent: Intent): ToolSelection | null;
  selectByName(toolName: string, parameters?: Record<string, unknown>): ToolSelection | null;
  selectByCategory(category: string, parameters?: Record<string, unknown>): ToolSelection | null;
  suggestTools(query: string): ToolSelection[];
}
