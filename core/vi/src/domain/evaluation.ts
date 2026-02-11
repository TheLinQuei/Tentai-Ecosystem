/**
 * Evaluation and Regression Harness Domain Models
 * 
 * Defines types and interfaces for automated evaluation of Vi conversations
 * against golden conversations, tracking correctness, memory recall, tool usage,
 * and other key performance metrics.
 */

/**
 * Classification labels for golden conversations
 */
export type IntentType = 
  | 'information_retrieval'
  | 'task_execution'
  | 'clarification'
  | 'relationship_building'
  | 'problem_solving'
  | 'creative'
  | 'navigation'
  | 'other';

export type StanceLabel = 
  | 'helpful'
  | 'cautious'
  | 'confident'
  | 'exploratory'
  | 'supportive'
  | 'directive'
  | 'reflective';

export type MemoryRecallType = 
  | 'none'
  | 'episodic'
  | 'semantic'
  | 'relational'
  | 'commitment';

export type ToolUsageCorrectness = 
  | 'not_applicable'
  | 'correct_invocation'
  | 'correct_interpretation'
  | 'incorrect_invocation'
  | 'incorrect_interpretation'
  | 'missed_opportunity'
  | 'hallucinated_tool';

export type RefusalCorrectness = 
  | 'not_applicable'
  | 'correct_refusal'
  | 'correct_allowance'
  | 'inappropriate_refusal'
  | 'inappropriate_allowance';

/**
 * Golden conversation: reference implementation for evaluation
 */
export interface GoldenConversation {
  id: string;
  conversationId: string;
  title: string;
  description: string;
  
  // Classification
  intent: IntentType;
  primaryStance: StanceLabel;
  secondaryStances?: StanceLabel[];
  
  // Requirements
  requiredMemoryRecall?: MemoryRecallType[];
  requiredToolUsage?: ToolUsageCorrectness[];
  requiredRefusal?: RefusalCorrectness[];
  
  // Reference messages
  userMessages: string[];
  goldenResponses: string[];
  
  // Metadata
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  creator: string;
  version: number;
}

/**
 * Evaluation result for a single conversation turn
 */
export interface TurnEvaluation {
  turnNumber: number;
  userMessage: string;
  actualResponse: string;
  
  // Scoring (0-1 scale unless otherwise noted)
  scores: {
    identityCorrectness: number;      // Does tone/voice match?
    memoryPrecision: number;           // No false memory claims
    memoryRecall: number;              // Retrieved required memories
    toolSuccessRate: number;           // Tools invoked correctly & succeeded
    toneAdherence: number;             // Matches required stance(s)
    refusalCorrectness: number;        // Correct refusal/allowance decisions
    factualAccuracy: number;           // No hallucinations
    responseCompleteness: number;      // Addresses all user needs
  };
  
  // Timing and cost
  latencyMs: number;
  estimatedTokens?: number;
  estimatedCost?: number;
  
  // Evidence
  retrievedMemories?: string[];
  toolsInvoked?: string[];
  toolResults?: Record<string, unknown>;
  memoryInjected?: string[];
  
  // Tags for issues found
  issues: IssueTag[];
  
  evaluatedAt: Date;
}

/**
 * Issue tag for categorizing evaluation findings
 */
export interface IssueTag {
  category: 'memory' | 'tone' | 'refusal' | 'tool' | 'hallucination' | 'accuracy' | 'other';
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  evidence?: string;
}

/**
 * Complete evaluation result for a conversation
 */
export interface ConversationEvaluation {
  id: string;
  goldenConversationId: string;
  actualConversationId: string;
  
  // Overall scores (0-1 scale)
  overallScore: number;
  identityScore: number;
  memoryScore: number;
  toolScore: number;
  toneScore: number;
  refusalScore: number;
  
  // Per-turn results
  turnEvaluations: TurnEvaluation[];
  
  // Summary statistics
  stats: {
    totalTurns: number;
    avgLatencyMs: number;
    totalTokens?: number;
    totalCost?: number;
    issueCount: number;
    criticalIssueCount: number;
    passRate: number; // % of turns meeting all criteria
  };
  
  // User feedback
  userFeedback?: {
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
    feedback: 'positive' | 'negative' | 'neutral';
    tags: string[];
  };
  
  // Regression status
  regressionStatus: 'pass' | 'fail' | 'degradation' | 'improvement';
  previousScore?: number;
  
  evaluatedAt: Date;
  evaluatedBy?: string; // System or human
}

/**
 * Regression test suite
 */
export interface RegressionTestSuite {
  id: string;
  name: string;
  description: string;
  
  // Included golden conversations
  goldenConversationIds: string[];
  
  // Thresholds
  passingScore: number; // 0-1, e.g., 0.85
  criticalIssueThreshold: number;
  
  // Configuration
  evaluateMemory: boolean;
  evaluateTools: boolean;
  evaluateRefusals: boolean;
  evaluateTone: boolean;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  creator: string;
  tags: string[];
}

/**
 * Regression test run result
 */
export interface RegressionTestRun {
  id: string;
  suiteId: string;
  
  // Results
  evaluations: ConversationEvaluation[];
  
  // Aggregate stats
  stats: {
    totalEvaluations: number;
    passedEvaluations: number;
    failedEvaluations: number;
    avgOverallScore: number;
    regressions: number; // Score decreased
    improvements: number; // Score increased
    degradations: number; // Passed before, failed now
  };
  
  // Issues summary
  issuesSummary: {
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    topIssues: IssueTag[];
  };
  
  // Approval status
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvalComment?: string;
  
  // Timing
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

/**
 * Response feedback from console
 */
export interface ResponseFeedback {
  id: string;
  conversationId: string;
  messageId: string;
  
  // User feedback
  rating: 1 | 2 | 3 | 4 | 5;
  feedback: 'positive' | 'negative' | 'neutral';
  comment?: string;
  
  // Issue tags
  issues: IssueTag[];
  
  // Metadata
  userId: string;
  createdAt: Date;
}

/**
 * Evaluation dataset export (JSONL format)
 */
export interface EvaluationDatasetEntry {
  id: string;
  goldenConversationId: string;
  goldenTitle: string;
  
  // Features
  userMessage: string;
  actualResponse: string;
  goldenResponse: string;
  
  // Labels
  intent: IntentType;
  stance: StanceLabel;
  
  // Evaluation results
  scores: Record<string, number>;
  issues: IssueTag[];
  feedback?: ResponseFeedback;
  
  // Metadata
  evaluatedAt: Date;
  version: number;
}

/**
 * Evaluation metrics summary
 */
export interface EvaluationMetrics {
  period: {
    startDate: Date;
    endDate: Date;
  };
  
  // Overall metrics
  totalEvaluations: number;
  avgOverallScore: number;
  passRate: number;
  
  // By category
  byIntent: Record<IntentType, { count: number; avgScore: number }>;
  byStance: Record<StanceLabel, { count: number; avgScore: number }>;
  byToolType?: Record<string, { count: number; successRate: number }>;
  
  // Issues
  topIssues: Array<{
    category: string;
    message: string;
    frequency: number;
    avgSeverity: 'info' | 'warning' | 'error' | 'critical';
  }>;
  
  // Regressions
  regressionCount: number;
  improvementCount: number;
  
  // Performance
  avgLatencyMs: number;
  avgTokensPerTurn?: number;
  estimatedTotalCost?: number;
}

/**
 * Evaluation configuration
 */
export interface EvaluationConfig {
  // Scoring weights (must sum to 1.0)
  weights: {
    identity: number;
    memory: number;
    tools: number;
    tone: number;
    refusal: number;
    accuracy: number;
    completeness: number;
  };
  
  // Thresholds
  passingScore: number;
  warningThreshold: number;
  
  // Sampling
  enableSampling: boolean;
  sampleRate?: number; // 0-1
  
  // Async processing
  enableAsync: boolean;
  maxConcurrentEvals?: number;
  
  // Logging
  verbose: boolean;
  logToConsole: boolean;
}

/**
 * Evaluator interface for pluggable scoring implementations
 */
export interface Evaluator {
  /**
   * Evaluate a single turn
   */
  evaluateTurn(
    userMessage: string,
    actualResponse: string,
    context: EvaluationContext
  ): Promise<TurnEvaluation>;
  
  /**
   * Evaluate full conversation
   */
  evaluateConversation(
    golden: GoldenConversation,
    actual: { userMessages: string[]; responses: string[] },
    context: EvaluationContext
  ): Promise<ConversationEvaluation>;
}

/**
 * Context passed to evaluators
 */
export interface EvaluationContext {
  goldenConversation: GoldenConversation;
  config: EvaluationConfig;
  userId: string;
  sessionId: string;
  conversationId: string;
  
  // Available data
  memoryRetrieved?: string[];
  toolInvocations?: Array<{
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
    success: boolean;
  }>;
  memoryInjected?: string[];
}
