/**
 * Tool Registry
 * 
 * Central catalog of all registered tools.
 * Provides registration, discovery, and metadata retrieval.
 */

import { Tool, ToolRegistry, ToolMetadata, ToolCategory } from './types.js';

export class ToolRegistryImpl {
  private registry: ToolRegistry = new Map();

  /**
   * Register a new tool in the system.
   * Validates tool structure before registering.
   */
  register(tool: Tool): void {
    if (!tool.name || tool.name.trim() === '') {
      throw new Error('Tool must have a non-empty name');
    }

    if (this.registry.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }

    if (!tool.description || tool.description.trim() === '') {
      throw new Error(`Tool "${tool.name}" must have a description`);
    }

    if (!tool.execute || typeof tool.execute !== 'function') {
      throw new Error(`Tool "${tool.name}" must implement execute() method`);
    }

    if (!tool.inputSchema) {
      throw new Error(`Tool "${tool.name}" must define inputSchema`);
    }

    // Register the tool
    this.registry.set(tool.name, tool);
  }

  /**
   * Retrieve a tool by name.
   */
  get(name: string): Tool | undefined {
    return this.registry.get(name);
  }

  /**
   * Get tool by name, throw if not found.
   */
  getOrThrow(name: string): Tool {
    const tool = this.registry.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found in registry`);
    }
    return tool;
  }

  /**
   * List all registered tools.
   */
  list(): Tool[] {
    return Array.from(this.registry.values());
  }

  /**
   * List metadata about all tools (for discovery).
   */
  listMetadata(): ToolMetadata[] {
    return this.list().map(tool => ({
      name: tool.name,
      category: tool.category,
      description: tool.description,
      isEnabled: tool.isEnabled,
      permissions: tool.permissions,
    }));
  }

  /**
   * Search tools by name or description (case-insensitive).
   */
  search(keyword: string): Tool[] {
    const lowerKeyword = keyword.toLowerCase();
    return this.list().filter(tool =>
      tool.name.toLowerCase().includes(lowerKeyword) ||
      tool.description.toLowerCase().includes(lowerKeyword) ||
      (tool.longDescription?.toLowerCase().includes(lowerKeyword) ?? false)
    );
  }

  /**
   * Filter tools by category.
   */
  byCategory(category: ToolCategory): Tool[] {
    return this.list().filter(tool => tool.category === category);
  }

  /**
   * Filter tools by permission requirement.
   */
  requireingPermission(permission: string): Tool[] {
    return this.list().filter(tool => 
      tool.permissions.includes(permission as any)
    );
  }

  /**
   * Check if a tool exists.
   */
  exists(name: string): boolean {
    return this.registry.has(name);
  }

  /**
   * Unregister a tool (admin only).
   */
  unregister(name: string): boolean {
    return this.registry.delete(name);
  }

  /**
   * Clear all tools (for testing).
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Get tool count.
   */
  count(): number {
    return this.registry.size;
  }

  /**
   * Get all enabled tools.
   */
  listEnabled(): Tool[] {
    return this.list().filter(tool => tool.isEnabled);
  }

  /**
   * Disable a tool temporarily (without unregistering).
   */
  disable(name: string): void {
    const tool = this.getOrThrow(name);
    (tool as any).isEnabled = false;
  }

  /**
   * Enable a tool.
   */
  enable(name: string): void {
    const tool = this.getOrThrow(name);
    (tool as any).isEnabled = true;
  }
}

// Singleton instance
let registryInstance: ToolRegistryImpl | null = null;

/**
 * Get the global tool registry instance.
 */
export function getToolRegistry(): ToolRegistryImpl {
  if (!registryInstance) {
    registryInstance = new ToolRegistryImpl();
  }
  return registryInstance;
}

/**
 * Reset the registry (for testing).
 */
export function resetToolRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
  }
  registryInstance = null;
}
