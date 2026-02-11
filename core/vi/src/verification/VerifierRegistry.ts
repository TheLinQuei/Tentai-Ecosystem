/**
 * Verifier Registry
 * 
 * Manages verifier plugins for different tool types. Allows registering custom
 * verifiers and retrieving them during task execution.
 */

import { Verifier, VerificationResult } from '../domain/verification';
import { SearchResultVerifier, ShellCommandVerifier, HttpRequestVerifier, DatabaseQueryVerifier } from './verifiers/ToolVerifiers.js';

export interface VerifierRegistry {
  /**
   * Register a verifier for a tool
   * @param toolName Tool identifier (e.g., "search", "shell", "http")
   * @param verifier Verifier instance
   */
  register(toolName: string, verifier: Verifier): void;

  /**
   * Get verifier for a tool
   * @param toolName Tool identifier
   * @returns Verifier or undefined
   */
  get(toolName: string): Verifier | undefined;

  /**
   * Register a generic verifier by type
   * @param verifierType Type identifier (e.g., "json-schema", "regex")
   * @param verifier Verifier instance
   */
  registerGeneric(verifierType: string, verifier: Verifier): void;

  /**
   * Get generic verifier by type
   * @param verifierType Type identifier
   * @returns Verifier or undefined
   */
  getGeneric(verifierType: string): Verifier | undefined;

  /**
   * Verify result using registered verifier
   * @param toolName Tool identifier
   * @param result Tool execution result
   * @param expected Expected output criteria
   * @returns VerificationResult
   */
  verify(
    toolName: string,
    result: unknown,
    expected?: unknown
  ): Promise<VerificationResult>;

  /**
   * Verify result using generic verifier type
   * @param verifierType Verifier type identifier
   * @param result Result to verify
   * @param expected Expected criteria
   * @returns VerificationResult
   */
  verifyGeneric(
    verifierType: string,
    result: unknown,
    expected?: unknown
  ): Promise<VerificationResult>;

  /**
   * List all registered tool verifiers
   * @returns Array of tool names with verifiers
   */
  listToolVerifiers(): string[];

  /**
   * List all registered generic verifiers
   * @returns Array of verifier type names
   */
  listGenericVerifiers(): string[];
}

/**
 * Default implementation of VerifierRegistry
 */
export class DefaultVerifierRegistry implements VerifierRegistry {
  private toolVerifiers: Map<string, Verifier> = new Map();
  private genericVerifiers: Map<string, Verifier> = new Map();

  register(toolName: string, verifier: Verifier): void {
    this.toolVerifiers.set(toolName, verifier);
  }

  get(toolName: string): Verifier | undefined {
    return this.toolVerifiers.get(toolName);
  }

  registerGeneric(verifierType: string, verifier: Verifier): void {
    this.genericVerifiers.set(verifierType, verifier);
  }

  getGeneric(verifierType: string): Verifier | undefined {
    return this.genericVerifiers.get(verifierType);
  }

  async verify(
    toolName: string,
    result: unknown,
    expected?: unknown
  ): Promise<VerificationResult> {
    const verifier = this.toolVerifiers.get(toolName);
    if (!verifier) {
      return { 
        passed: false, 
        errors: [`No verifier registered for tool: ${toolName}`] 
      };
    }
    return verifier.verify(result, expected);
  }

  async verifyGeneric(
    verifierType: string,
    result: unknown,
    expected?: unknown
  ): Promise<VerificationResult> {
    const verifier = this.genericVerifiers.get(verifierType);
    if (!verifier) {
      return { 
        passed: false, 
        errors: [`No generic verifier registered for type: ${verifierType}`] 
      };
    }
    return verifier.verify(result, expected);
  }

  listToolVerifiers(): string[] {
    return Array.from(this.toolVerifiers.keys());
  }

  listGenericVerifiers(): string[] {
    return Array.from(this.genericVerifiers.keys());
  }
}

/**
 * Global registry instance (singleton)
 */
let globalRegistry: VerifierRegistry | null = null;

/**
 * Get or initialize global verifier registry
 */
export function getGlobalVerifierRegistry(): VerifierRegistry {
  if (!globalRegistry) {
    globalRegistry = new DefaultVerifierRegistry();
  }
  return globalRegistry;
}

/**
 * Set global verifier registry (for testing)
 */
export function setGlobalVerifierRegistry(registry: VerifierRegistry): void {
  globalRegistry = registry;
}

/**
 * Reset global verifier registry
 */
export function resetGlobalVerifierRegistry(): void {
  globalRegistry = null;
}

/**
 * Idempotently register common verifiers for built-in tools
 */
export function registerDefaultVerifiers(registry: VerifierRegistry = getGlobalVerifierRegistry()): VerifierRegistry {
  const defaults: Array<[string, Verifier]> = [
    ['search', new SearchResultVerifier()],
    ['shell', new ShellCommandVerifier()],
    ['http', new HttpRequestVerifier()],
    ['database', new DatabaseQueryVerifier()],
  ];

  defaults.forEach(([tool, verifier]) => {
    if (!registry.get(tool)) {
      registry.register(tool, verifier);
    }
  });

  return registry;
}
