import type { FastifyBaseLogger } from 'fastify';
import type { ExecutionResult } from './executor.js';
import type { Observation } from './observer.js';
import type { Plan } from './planner.js';

// Pipeline Evaluation Metrics
export interface PipelineEvaluation {
  observationId: string;
  timestamp: string;
  intentDetectionConfidence: number; // 0-1
  toolSelectionCorrectness: 'correct' | 'suboptimal' | 'wrong' | 'unknown';
  outputCompleteness: number; // 0-1
  userSatisfaction: 'satisfied' | 'neutral' | 'unsatisfied' | 'unknown';
  retryCount: number;
  latencyMs: number;
  errors: string[];
}

// Track follow-up patterns that indicate failure
const FAILURE_PATTERNS = [
  /^no\s/i,
  /^that('s|\s+is)\s+(not|wrong)/i,
  /^i\s+meant/i,
  /^actually/i,
  /^try\s+again/i,
  /^repeat/i,
  /^what\?/i,
];

// Track satisfaction indicators
const SATISFACTION_PATTERNS = {
  satisfied: [/^thanks?/i, /^ty\b/i, /^perfect/i, /^great/i, /^awesome/i, /👍/, /🙏/],
  unsatisfied: [/^ugh/i, /^wtf/i, /^useless/i, /^wrong/i, /^no\s/i, /👎/, /😠/, /😡/],
};

/**
 * Evaluate pipeline execution quality and log metrics
 */
export function evaluatePipeline(
  obs: Observation,
  plan: Plan,
  execResult: ExecutionResult,
  latencyMs: number,
  log: FastifyBaseLogger
): PipelineEvaluation {
  const errors: string[] = [];
  
  // Collect errors from execution
  for (const output of execResult.outputs) {
    if (output.envelope.error) {
      errors.push(`Step ${output.step}: ${output.envelope.error}`);
    }
  }
  
  // Count retries (if envelope includes retry metadata)
  const retryCount = execResult.outputs.filter(o => 
    o.envelope.error && o.envelope.error.includes('retry')
  ).length;
  
  // Intent detection confidence (stub for now, will integrate with planner)
  const intentDetectionConfidence = plan.reasoning ? 0.8 : 0.5;
  
  // Tool selection correctness (heuristic based on success)
  let toolSelectionCorrectness: PipelineEvaluation['toolSelectionCorrectness'] = 'unknown';
  if (execResult.success) {
    toolSelectionCorrectness = 'correct';
  } else if (errors.length > 0) {
    toolSelectionCorrectness = 'wrong';
  }
  
  // Output completeness (ratio of successful steps)
  const successfulSteps = execResult.outputs.filter(o => o.envelope.ok).length;
  const outputCompleteness = plan.steps.length > 0 
    ? successfulSteps / plan.steps.length 
    : 0;
  
  // User satisfaction (stub, will track follow-ups in future)
  // For now, assume neutral unless we detect failure patterns in content
  let userSatisfaction: PipelineEvaluation['userSatisfaction'] = 'unknown';
  const content = obs.content.toLowerCase();
  
  // Check for failure patterns
  const hasFailurePattern = FAILURE_PATTERNS.some(p => p.test(content));
  if (hasFailurePattern) {
    userSatisfaction = 'unsatisfied';
  } else {
    // Check for explicit satisfaction/dissatisfaction
    const hasSatisfied = SATISFACTION_PATTERNS.satisfied.some(p => p.test(content));
    const hasUnsatisfied = SATISFACTION_PATTERNS.unsatisfied.some(p => p.test(content));
    if (hasSatisfied) userSatisfaction = 'satisfied';
    else if (hasUnsatisfied) userSatisfaction = 'unsatisfied';
    else userSatisfaction = 'neutral';
  }
  
  const evaluation: PipelineEvaluation = {
    observationId: obs.id,
    timestamp: new Date().toISOString(),
    intentDetectionConfidence,
    toolSelectionCorrectness,
    outputCompleteness,
    userSatisfaction,
    retryCount,
    latencyMs,
    errors,
  };
  
  // Log evaluation
  log.info({ evaluation }, '📊 Pipeline evaluation');
  
  // Note: Prometheus metrics export deferred - current metrics coverage sufficient
  // Note: Evaluation history storage deferred - focus on core stability first
  
  return evaluation;
}

/**
 * Detect if user is repeating/correcting (follow-up query pattern)
 */
export function isFollowUpQuery(content: string, previousContent?: string): boolean {
  if (!previousContent) return false;
  
  const contentLower = content.toLowerCase();
  const prevLower = previousContent.toLowerCase();
  
  // Check for repetition patterns
  const repetitionPatterns = [
    /^(again|repeat|once more)/i,
    /^same/i,
    /^try\s+again/i,
  ];
  
  if (repetitionPatterns.some(p => p.test(contentLower))) return true;
  
  // Check for correction patterns
  const correctionPatterns = [
    /^no[,.]?\s+(i\s+)?meant/i,
    /^actually/i,
    /^that('s|\s+is)\s+not/i,
  ];
  
  if (correctionPatterns.some(p => p.test(contentLower))) return true;
  
  // Check for high similarity (user asking same question)
  const similarity = calculateSimilarity(contentLower, prevLower);
  if (similarity > 0.7) return true;
  
  return false;
}

/**
 * Simple similarity score (0-1) based on word overlap
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  
  return intersection.size / union.size;
}
