/**
 * Reflector: post-run analysis and storage recommendations
 * Phase 1: simple extraction of key findings
 * Phase 2+: LLM-driven reflection and semantic extraction
 */

import { ThoughtState, Reflection, MemoryRecord, PolicyDecision } from './types.js';

export class Reflector {
  /**
   * Analyze a completed thought and generate reflection
   */
  async reflect(thought: ThoughtState): Promise<Reflection> {
    if (!thought.intent || !thought.execution || !thought.plan) {
      return {
        summary: 'Incomplete thought state; cannot reflect',
        keyFindings: [],
        confidenceInResponse: 0,
      };
    }

    const keyFindings: string[] = [];
    const memoryToStore: MemoryRecord[] = [];

    // Extract key findings and tool citations
    if (thought.execution.success) {
      keyFindings.push(`Successfully completed ${thought.intent.category} intent`);
      keyFindings.push(`Executed ${thought.execution.stepsExecuted.length} steps`);

      // Collect citations from tool results for memory attribution
      const toolCitations = this.extractToolCitations(thought.execution.toolResults || []);

      // Phase 1: simple memory extraction — ALWAYS extract conversation for later retrieval
      // Don't wait for intent.requiresMemory flag; store all user inputs as episodic memories
      // so they can be retrieved when needed (e.g., recall questions)
      if (thought.input && thought.input.length > 0) {
        memoryToStore.push({
            type: 'interaction',
          content: `User message: ${thought.input}`,
          userId: thought.userId,
          timestamp: thought.timestamp,
          citations: toolCitations.length > 0 ? toolCitations : undefined,
          ttl: 7 * 24 * 60 * 60, // 7-day TTL for conversation memories
        });
      
        // Also store assistant response for context
        // This allows later recall of the full exchange
        memoryToStore.push({
            type: 'context',
          content: `Assistant responded to "${thought.input.substring(0, 50)}..." with understanding`,
          userId: thought.userId,
          timestamp: new Date(thought.timestamp.getTime() + 100), // Slightly later timestamp
          citations: toolCitations.length > 0 ? toolCitations : undefined,
          ttl: 7 * 24 * 60 * 60,
        });
      }
    } else {
      keyFindings.push(`Execution failed: ${thought.execution.errors?.join(', ')}`);
    }

    // Derive policy decisions from executed steps (policy_check + tool authorization)
    const policyDecisions: PolicyDecision[] = [];
    for (const step of thought.execution.stepsExecuted) {
      if (step.type === 'policy_check') {
        const authorized = (step.result as any)?.authorized as boolean | undefined;
        policyDecisions.push({
          policyId: 'command_execution',
          name: 'Command Execution Authorization',
          action: authorized ? 'allow' : 'deny',
          reason: authorized ? 'Authorized by policy engine' : 'Policy denied execution',
          severity: authorized ? 'info' : 'block',
        });
      }
    }

    const summary = `Completed ${thought.intent.category} intent with ${thought.execution.success ? 'success' : 'failure'}. ` +
      `Executed ${thought.execution.stepsExecuted.length} steps in ${thought.execution.stepsExecuted.reduce((a, b) => a + b.duration, 0)}ms.`;

    return {
      summary,
      keyFindings,
      confidenceInResponse: thought.execution.success ? 0.8 : 0.2,
      memoryToStore: memoryToStore.length > 0 ? memoryToStore : undefined,
      policyDecisions: policyDecisions.length > 0 ? policyDecisions : undefined,
    };
  }

  /**
   * Extract citations from tool results
   */
  private extractToolCitations(toolResults: any[]): any[] {
    const citations: any[] = [];
    for (const result of toolResults) {
      if (result.citations && Array.isArray(result.citations)) {
        citations.push(...result.citations);
      } else if (result.toolName) {
        // Fallback: tool is its own source
        citations.push({
          id: `tool-${result.toolName}`,
          source: result.toolName,
          type: 'system' as const,
          snippet: result.result ? JSON.stringify(result.result).substring(0, 100) : undefined,
          confidence: 0.8,
        });
      }
    }
    return citations;
  }
}

