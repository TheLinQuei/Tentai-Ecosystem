/**
 * Verification Layer Domain Models
 * 
 * Defines interfaces and types for task verification, allowing tools to declare
 * expected outputs and custom verification logic. Enables autonomous confirmation
 * that tool execution succeeded before advancing to next task.
 */

/**
 * Result of a verification check
 */
export interface VerificationResult {
  passed: boolean;
  errors?: string[];
  details?: Record<string, unknown>;
}

/**
 * Verifier - verifies tool execution output
 */
export interface Verifier<T = unknown> {
  /**
   * Verify that tool output meets expected criteria
   * @param result The actual tool execution result
   * @param expected Optional expected output schema or constraints
   * @returns VerificationResult with passed status
   */
  verify(result: T, expected?: unknown): Promise<VerificationResult>;

  /**
   * Name of this verifier (e.g., "json-schema", "regex", "custom-api")
   */
  name: string;
}

/**
 * Task step verification configuration
 */
export interface StepVerificationConfig {
  /** Verifier type to use (e.g., "generic", "custom", "tool-specific") */
  verifierType: string;

  /** Tool name for tool-specific verifiers (e.g., "search", "shell") */
  toolName?: string;

  /** Expected output schema or verification criteria */
  expected?: unknown;

  /** Whether verification failure should fail the entire task */
  required?: boolean; // default: true

  /** Timeout for verification in ms */
  timeoutMs?: number; // default: 5000
}

/**
 * Task step with verification capability
 */
export interface VerifiableTaskStep {
  index: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  verification?: StepVerificationConfig;
  result?: unknown;
  verificationStatus?: 'unverified' | 'verified' | 'failed' | 'skipped';
  verificationError?: string;
  verifiedAt?: Date;
}

/**
 * Verification events for audit trail
 */
export type VerificationEventType =
  | 'verification_started'
  | 'verification_completed'
  | 'verification_failed'
  | 'verification_timeout'
  | 'verification_skipped';

export interface VerificationEvent {
  taskId: string;
  stepIndex: number;
  eventType: VerificationEventType;
  verifierName: string;
  payload: {
    expected?: unknown;
    result?: unknown;
    verificationResult?: VerificationResult;
    error?: string;
    durationMs?: number;
  };
  createdAt: Date;
}

/**
 * Generic verifier implementations
 */

/**
 * JSON Schema verifier - validates output against schema
 */
export class JsonSchemaVerifier implements Verifier {
  readonly name = 'json-schema';

  async verify(result: unknown, expected?: unknown): Promise<VerificationResult> {
    if (!expected) {
      return { passed: true };
    }

    try {
      // Basic type checking based on expected schema
      if (expected === 'string' && typeof result !== 'string') {
        return { 
          passed: false, 
          errors: [`Expected string, got ${typeof result}`] 
        };
      }
      if (expected === 'number' && typeof result !== 'number') {
        return { 
          passed: false, 
          errors: [`Expected number, got ${typeof result}`] 
        };
      }
      if (expected === 'boolean' && typeof result !== 'boolean') {
        return { 
          passed: false, 
          errors: [`Expected boolean, got ${typeof result}`] 
        };
      }
      if (expected === 'object' && (typeof result !== 'object' || result === null)) {
        return { 
          passed: false, 
          errors: [`Expected object, got ${typeof result}`] 
        };
      }

      // For object schemas, check required fields
      if (typeof expected === 'object' && expected !== null && 'required' in expected) {
        const required = (expected as any).required as string[];
        const resultObj = result as Record<string, unknown>;
        const missing = required.filter(key => !(key in resultObj));
        if (missing.length > 0) {
          return { 
            passed: false, 
            errors: [`Missing required fields: ${missing.join(', ')}`] 
          };
        }
      }

      return { passed: true };
    } catch (error) {
      return { 
        passed: false, 
        errors: [`Verification error: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }
}

/**
 * Regex verifier - validates string output against regex
 */
export class RegexVerifier implements Verifier {
  readonly name = 'regex';

  async verify(result: unknown, expected?: unknown): Promise<VerificationResult> {
    if (!expected) {
      return { passed: true };
    }

    try {
      if (typeof result !== 'string') {
        return { 
          passed: false, 
          errors: [`Expected string for regex verification, got ${typeof result}`] 
        };
      }

      if (typeof expected !== 'string') {
        return { 
          passed: false, 
          errors: [`Expected regex pattern as string`] 
        };
      }

      const regex = new RegExp(expected);
      const matches = regex.test(result);
      if (!matches) {
        return { 
          passed: false, 
          errors: [`String does not match pattern: ${expected}`] 
        };
      }

      return { passed: true, details: { matched: result } };
    } catch (error) {
      return { 
        passed: false, 
        errors: [`Regex verification error: ${error instanceof Error ? error.message : String(error)}`] 
      };
    }
  }
}

/**
 * Exact match verifier - verifies result equals expected value
 */
export class ExactMatchVerifier implements Verifier {
  readonly name = 'exact-match';

  async verify(result: unknown, expected?: unknown): Promise<VerificationResult> {
    if (expected === undefined) {
      return { passed: true };
    }

    const matches = JSON.stringify(result) === JSON.stringify(expected);
    if (!matches) {
      return { 
        passed: false, 
        errors: [`Result does not match expected value`],
        details: { expected, actual: result }
      };
    }

    return { passed: true };
  }
}

/**
 * No-op verifier - always passes (for unverified steps)
 */
export class PassthroughVerifier implements Verifier {
  readonly name = 'passthrough';

  async verify(): Promise<VerificationResult> {
    return { passed: true };
  }
}
