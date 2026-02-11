/**
 * Executor: carries out plan steps
 * Phase 1: deterministic execution with mock results
 * Phase 2+: wires to tools, memory, and policy engines
 */

import { Plan, Execution, ExecutionResult, ToolCallResult, VerificationOutcome } from './types.js';
import { PolicyEngine, ToolRunner } from './interfaces.js';
import { ToolRunner as ToolExecutionEngine } from '../tools/runner.js';
import { VerifierRegistry, getGlobalVerifierRegistry } from '../verification/VerifierRegistry.js';

export class Executor {
  constructor(
    private policyEngine: PolicyEngine,
    private toolRunner: ToolRunner = new ToolExecutionEngine(false),
    private verifierRegistry: VerifierRegistry = getGlobalVerifierRegistry()
  ) {}

  /**
   * Execute a plan and return execution results
   */
  async executePlan(plan: Plan, userId: string, sessionId?: string): Promise<Execution> {
    const stepsExecuted: ExecutionResult[] = [];
    let success = true;
    const errors: string[] = [];
    let output = '';
    const toolResults: ToolCallResult[] = [];
    const verificationSummary = { verified: 0, failed: 0, skipped: 0 };

    for (const step of plan.steps) {
      const start = Date.now();

      try {
        const result = await this.executeStep(step, userId, sessionId);
        stepsExecuted.push({
          stepId: step.id,
          type: step.type,
          duration: Date.now() - start,
          success: result.success,
          result: result.data,
        });

        if (!result.success) {
          success = false;
          errors.push(result.error || 'Step failed');
        }

        if (step.type === 'respond') {
          output = result.data?.output || output;
        }

        if (step.type === 'tool_call' && result.toolResult) {
          const verification = await this.verifyToolResult(step, result.toolResult, result.data);
          if (verification) {
            result.toolResult.verification = verification;
            if (verification.status === 'verified') verificationSummary.verified += 1;
            else if (verification.status === 'failed') verificationSummary.failed += 1;
            else verificationSummary.skipped += 1;

            const required = step.verification?.required !== false;
            if (verification.status === 'failed' && required) {
              success = false;
              errors.push(verification.errors?.join('; ') || 'Verification failed');
            }
          } else {
            verificationSummary.skipped += 1;
          }

          toolResults.push(result.toolResult);
        }
      } catch (error) {
        success = false;
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(errorMsg);
        stepsExecuted.push({
          stepId: step.id,
          type: step.type,
          duration: Date.now() - start,
          success: false,
          error: errorMsg,
        });
      }
    }

    return {
      stepsExecuted,
      success,
      output: output || 'No output generated',
      toolResults: toolResults.length > 0 ? toolResults : undefined,
      errors: errors.length > 0 ? errors : undefined,
      verificationSummary,
    };
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: any,
    userId: string,
    sessionId?: string
  ): Promise<{ success: boolean; data?: any; error?: string; toolResult?: ToolCallResult }> {
    if (step.type === 'respond') {
      // Phase 1: mock response
      return {
        success: true,
        data: {
          output: `Response to your request. (Step: ${step.id})`,
        },
      };
    }

    if (step.type === 'policy_check') {
      // Check with policy engine
      const authorized = await this.policyEngine.authorize('command_execution', userId);
      return {
        success: authorized,
        data: { authorized },
        error: authorized ? undefined : 'Policy denied execution',
      };
    }

    if (step.type === 'tool_call') {
      if (!this.toolRunner) {
        return {
          success: false,
          error: 'Tool runner not configured',
        };
      }

      const toolName = step.toolName || (step.params?.toolName as string) || 'list_tools';
      const params = (step.toolParams || step.params || {}) as Record<string, unknown>;

      // Policy check: authorize tool execution for this user
      const isAuthorized = await this.policyEngine.authorize(`tool:${toolName}`, userId);
      if (!isAuthorized) {
        // Record decision for telemetry/governance
        await this.policyEngine.recordDecision('tool_execution', userId, 'deny', `Not authorized for tool ${toolName}`).catch(() => {});
        return {
          success: false,
          error: 'Policy denied tool execution',
          toolResult: {
            toolId: step.id,
            toolName,
            input: params,
            error: 'Policy denied tool execution',
            status: 'permission_denied',
            timestamp: new Date(),
          },
        };
      }

      const result = await this.toolRunner.execute(toolName, params, {
        userId,
        sessionId,
        timestamp: new Date(),
      });

      // Record allow decision (best-effort; non-blocking)
      await this.policyEngine.recordDecision('tool_execution', userId, 'allow', `Authorized tool ${toolName}`).catch(() => {});

      return {
        success: result.success,
        data: result.data,
        error: result.error,
        toolResult: {
          toolId: step.id,
          toolName,
          input: params,
          result: result.data,
          error: result.error,
          status: (result.status as any) || (result.success ? 'success' : 'failure'),
          timestamp: new Date(),
          citations: (result as any)?.citations,  // Preserve tool citations
        },
      };
    }

    if (step.type === 'memory_access') {
      // Phase 1: memory not yet implemented
      return {
        success: false,
        error: 'Memory access not yet implemented (Phase 2)',
      };
    }

    return {
      success: false,
      error: `Unknown step type: ${step.type}`,
    };
  }

  /**
   * Verify a tool call result using configured verifiers (Phase 5: Verified Actions)
   */
  private async verifyToolResult(step: any, toolResult: ToolCallResult, rawResult: unknown): Promise<VerificationOutcome | undefined> {
    if (!this.verifierRegistry) return undefined;

    const toolName = toolResult.toolName;
    const verifierType = step.verification?.verifierType;
    const expected = step.verification?.expected;
    const verifier = verifierType
      ? this.verifierRegistry.getGeneric(verifierType)
      : this.verifierRegistry.get(toolName);

    // Default verification: mirror tool success status
    if (!verifier) {
      return {
        status: toolResult.status === 'success' || toolResult.status === undefined ? 'verified' : 'failed',
        verifier: verifierType || 'status',
        errors: toolResult.error ? [toolResult.error] : undefined,
      };
    }

    try {
      const verificationResult = await verifier.verify(rawResult ?? toolResult.result, expected);
      return {
        status: verificationResult.passed ? 'verified' : 'failed',
        verifier: verifier.name,
        errors: verificationResult.errors,
        details: verificationResult.details,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'failed',
        verifier: verifier.name,
        errors: [message],
      };
    }
  }
}
