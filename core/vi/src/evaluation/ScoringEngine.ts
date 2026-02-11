/**
 * Evaluation Scoring Engine
 * 
 * Computes evaluation scores based on configurable weights and scoring strategies
 */

import { TurnEvaluation, EvaluationConfig, IssueTag } from '../domain/evaluation';

/**
 * Default evaluation configuration
 */
export const DEFAULT_EVAL_CONFIG: EvaluationConfig = {
  weights: {
    identity: 0.15,
    memory: 0.20,
    tools: 0.25,
    tone: 0.15,
    refusal: 0.10,
    accuracy: 0.10,
    completeness: 0.05,
  },
  passingScore: 0.85,
  warningThreshold: 0.75,
  enableSampling: false,
  enableAsync: true,
  maxConcurrentEvals: 10,
  verbose: false,
  logToConsole: false,
};

/**
 * Scoring engine for evaluations
 */
export class ScoringEngine {
  private config: EvaluationConfig;

  constructor(config: Partial<EvaluationConfig> = {}) {
    this.config = { ...DEFAULT_EVAL_CONFIG, ...config };
    this.validateConfig();
  }

  /**
   * Validate that weights sum to 1.0
   */
  private validateConfig(): void {
    const weightSum = Object.values(this.config.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1.0) > 0.001) {
      throw new Error(
        `Evaluation weights must sum to 1.0, got ${weightSum}. Current weights: ${JSON.stringify(this.config.weights)}`
      );
    }
  }

  /**
   * Calculate overall score from component scores
   */
  calculateOverallScore(turnEval: TurnEvaluation): number {
    const scores = turnEval.scores;
    const weighted =
      scores.identityCorrectness * this.config.weights.identity +
      scores.memoryPrecision * this.config.weights.memory +
      scores.toolSuccessRate * this.config.weights.tools +
      scores.toneAdherence * this.config.weights.tone +
      scores.refusalCorrectness * this.config.weights.refusal +
      scores.factualAccuracy * this.config.weights.accuracy +
      scores.responseCompleteness * this.config.weights.completeness;

    return Math.min(1.0, Math.max(0.0, weighted));
  }

  /**
   * Determine pass/fail status
   */
  determinePassStatus(overallScore: number): 'pass' | 'fail' {
    return overallScore >= this.config.passingScore ? 'pass' : 'fail';
  }

  /**
   * Generate issues from score analysis
   */
  generateIssues(turnEval: TurnEvaluation): IssueTag[] {
    const issues: IssueTag[] = [];
    const scores = turnEval.scores;
    const threshold = this.config.warningThreshold;

    if (scores.identityCorrectness < threshold) {
      issues.push({
        category: 'tone',
        severity: scores.identityCorrectness < 0.5 ? 'error' : 'warning',
        message: `Identity/tone score low: ${(scores.identityCorrectness * 100).toFixed(1)}%`,
      });
    }

    if (scores.memoryPrecision < threshold) {
      issues.push({
        category: 'memory',
        severity: scores.memoryPrecision < 0.5 ? 'error' : 'warning',
        message: `Memory precision issues: ${(scores.memoryPrecision * 100).toFixed(1)}%`,
      });
    }

    if (scores.memoryRecall < threshold) {
      issues.push({
        category: 'memory',
        severity: scores.memoryRecall < 0.5 ? 'error' : 'warning',
        message: `Memory recall incomplete: ${(scores.memoryRecall * 100).toFixed(1)}%`,
      });
    }

    if (scores.toolSuccessRate < threshold) {
      issues.push({
        category: 'tool',
        severity: scores.toolSuccessRate < 0.5 ? 'error' : 'warning',
        message: `Tool success rate: ${(scores.toolSuccessRate * 100).toFixed(1)}%`,
      });
    }

    if (scores.toneAdherence < threshold) {
      issues.push({
        category: 'tone',
        severity: scores.toneAdherence < 0.5 ? 'error' : 'warning',
        message: `Tone adherence: ${(scores.toneAdherence * 100).toFixed(1)}%`,
      });
    }

    if (scores.refusalCorrectness < threshold) {
      issues.push({
        category: 'refusal',
        severity: scores.refusalCorrectness < 0.5 ? 'critical' : 'error',
        message: `Refusal correctness: ${(scores.refusalCorrectness * 100).toFixed(1)}%`,
      });
    }

    if (scores.factualAccuracy < threshold) {
      issues.push({
        category: 'hallucination',
        severity: scores.factualAccuracy < 0.5 ? 'critical' : 'error',
        message: `Factual accuracy issues: ${(scores.factualAccuracy * 100).toFixed(1)}%`,
      });
    }

    if (scores.responseCompleteness < threshold) {
      issues.push({
        category: 'accuracy',
        severity: 'warning',
        message: `Response incomplete: ${(scores.responseCompleteness * 100).toFixed(1)}%`,
      });
    }

    return issues;
  }

  /**
   * Calculate average score for multiple turns
   */
  calculateAverageScore(
    overallScores: number[],
    weights?: number[]
  ): number {
    if (overallScores.length === 0) return 0;

    if (weights) {
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      const weightedSum = overallScores.reduce(
        (sum, score, idx) => sum + score * (weights[idx] || 1),
        0
      );
      return weightedSum / totalWeight;
    }

    const sum = overallScores.reduce((a, b) => a + b, 0);
    return sum / overallScores.length;
  }

  /**
   * Detect regression vs improvement
   */
  detectRegression(
    currentScore: number,
    previousScore?: number,
    threshold: number = 0.05
  ): 'pass' | 'fail' | 'degradation' | 'improvement' {
    const currentStatus = this.determinePassStatus(currentScore);

    if (previousScore === undefined) {
      return currentStatus;
    }

    const previousStatus = this.determinePassStatus(previousScore);

    // If both pass or both fail, check for improvement/degradation
    if (currentStatus === previousStatus) {
      const difference = currentScore - previousScore;
      if (difference > threshold) {
        return 'improvement';
      } else if (difference < -threshold) {
        return 'degradation';
      }
      return currentStatus;
    }

    // Status changed
    if (currentStatus === 'pass' && previousStatus === 'fail') {
      return 'improvement';
    }
    if (currentStatus === 'fail' && previousStatus === 'pass') {
      return 'degradation';
    }

    return currentStatus;
  }

  /**
   * Score a response against expected output
   */
  scoreResponseQuality(
    actualResponse: string,
    expectedResponse: string,
    strictMode: boolean = false
  ): { score: number; details: string[] } {
    const details: string[] = [];
    let score = 0.0;

    if (!actualResponse) {
      details.push('Response is empty');
      return { score, details };
    }

    // Length similarity
    const actualLen = actualResponse.length;
    const expectedLen = expectedResponse.length;
    const lengthDiff = Math.abs(actualLen - expectedLen) / Math.max(expectedLen, 1);
    const lengthScore = Math.max(0, 1 - lengthDiff);

    // Token overlap (basic)
    const actualTokens = new Set(actualResponse.toLowerCase().split(/\s+/));
    const expectedTokens = new Set(expectedResponse.toLowerCase().split(/\s+/));
    const intersection = new Set([...actualTokens].filter((x) => expectedTokens.has(x)));
    const union = new Set([...actualTokens, ...expectedTokens]);
    const jaccardSimilarity = intersection.size / Math.max(union.size, 1);

    score = (lengthScore + jaccardSimilarity) / 2;

    if (strictMode && score < 0.7) {
      details.push(`Low similarity: ${(score * 100).toFixed(1)}%`);
    }

    if (actualResponse.includes('undefined') || actualResponse.includes('[object Object]')) {
      details.push('Serialization issues detected');
      score *= 0.8; // Penalize serialization issues
    }

    return {
      score: Math.min(1.0, Math.max(0.0, score)),
      details,
    };
  }

  /**
   * Normalize scores to 0-1 range
   */
  normalizeScore(value: number, min: number = 0, max: number = 1): number {
    if (max <= min) return 1.0;
    const normalized = (Math.min(value, max) - min) / (max - min);
    return Math.min(1.0, Math.max(0.0, normalized));
  }

  /**
   * Get human-readable score interpretation
   */
  interpretScore(score: number): {
    level: 'excellent' | 'good' | 'fair' | 'poor' | 'failing';
    interpretation: string;
  } {
    if (score >= 0.95) {
      return { level: 'excellent', interpretation: 'Exceptional performance' };
    } else if (score >= 0.85) {
      return { level: 'good', interpretation: 'Meets expectations' };
    } else if (score >= 0.75) {
      return { level: 'fair', interpretation: 'Acceptable with issues' };
    } else if (score >= 0.60) {
      return { level: 'poor', interpretation: 'Significant issues' };
    } else {
      return { level: 'failing', interpretation: 'Failed to meet minimum criteria' };
    }
  }
}
