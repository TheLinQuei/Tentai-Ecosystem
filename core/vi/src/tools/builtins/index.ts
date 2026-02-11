/**
 * Built-in Tools Initialization
 * 
 * Registers all built-in tools into the registry.
 */

import { getToolRegistry } from '../registry.js';
import { ListToolsTool } from './ListTools.js';
import { GetCurrentTimeTool } from './GetCurrentTime.js';
import { CalculateTool } from './Calculate.js';
import { SearchMemoryTool } from './SearchMemory.js';
import { GetUserContextTool } from './GetUserContext.js';
import { DeterministicEchoTool } from './DeterministicEcho.js';

/**
 * Register all built-in tools.
 * Call this once during application initialization.
 */
export function initializeBuiltinTools(): void {
  const registry = getToolRegistry();

  if (registry.count() > 0) {
    return;
  }

  try {
    registry.register(ListToolsTool);
  } catch (e) {
    console.warn('Failed to register ListToolsTool:', e);
  }

  try {
    registry.register(GetCurrentTimeTool);
  } catch (e) {
    console.warn('Failed to register GetCurrentTimeTool:', e);
  }

  try {
    registry.register(CalculateTool);
  } catch (e) {
    console.warn('Failed to register CalculateTool:', e);
  }

  try {
    registry.register(SearchMemoryTool);
  } catch (e) {
    console.warn('Failed to register SearchMemoryTool:', e);
  }

  try {
    registry.register(GetUserContextTool);
  } catch (e) {
    console.warn('Failed to register GetUserContextTool:', e);
  }

  try {
    registry.register(DeterministicEchoTool);
  } catch (e) {
    console.warn('Failed to register DeterministicEchoTool:', e);
  }
}

/**
 * Export all built-in tools for testing/reference.
 */
export {
  ListToolsTool,
  GetCurrentTimeTool,
  CalculateTool,
  SearchMemoryTool,
  GetUserContextTool,
  DeterministicEchoTool,
};
