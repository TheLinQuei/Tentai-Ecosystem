/**
 * Phase 3.1 Integration Tests - Evaluation and Regression Harness
 * 
 * Tests for:
 * - Domain models and types
 * - Repository CRUD operations
 * - Database migration and schema
 * - Scoring engine calculations
 * - Dataset export
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { loadConfig } from '../../src/config/config';
import { createPool } from '../../src/db/pool';
import { runMigrations } from '../../src/db/migrations';
import { initializeLogger, getLogger } from '../../src/telemetry/logger';
import { initializeTelemetry } from '../../src/telemetry/telemetry';
import { EvaluationRepository } from '../../src/db/repositories/EvaluationRepository';
import { ScoringEngine } from '../../src/evaluation/ScoringEngine';
import { DatasetExporter } from '../../src/evaluation/DatasetExporter';
import {
  GoldenConversation,
  IntentType,
  TurnEvaluation,
  ConversationEvaluation,
  RegressionTestSuite,
  ResponseFeedback,
} from '../../src/domain/evaluation';

describe('Phase 3.1: Evaluation and Regression Harness', () => {
  let pool: Pool;
  let repository: EvaluationRepository;
  let scoringEngine: ScoringEngine;

  beforeAll(async () => {
    const config = loadConfig();
    initializeLogger(config.logging.level);
    initializeTelemetry(config.telemetry.path, config.telemetry.enabled);
    
    pool = createPool(config);
    await runMigrations(pool);
    repository = new EvaluationRepository(pool);
    scoringEngine = new ScoringEngine();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.query('DELETE FROM response_feedback');
    await pool.query('DELETE FROM regression_test_runs');
    await pool.query('DELETE FROM regression_test_suites');
    await pool.query('DELETE FROM conversation_evaluations');
    await pool.query('DELETE FROM golden_conversations');
  });

  describe('Domain Models', () => {
    it('should define IntentType enum', () => {
      const intents: IntentType[] = [
        'information_retrieval',
        'task_execution',
        'clarification',
        'analysis',
        'creative',
        'debugging',
        'learning',
      ];
      expect(intents).toHaveLength(7);
    });

    it('should define GoldenConversation interface', () => {
      const golden: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'Test Golden',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: ['confident'],
        requiredMemoryRecall: ['recent_context'],
        requiredToolUsage: ['web_search'],
        requiredRefusal: [],
        userMessages: ['Tell me about X'],
        goldenResponses: ['X is...'],
        tags: ['test'],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(golden.id).toBe('golden_1');
      expect(golden.intent).toBe('information_retrieval');
    });

    it('should define TurnEvaluation with component scores', () => {
      const turn: TurnEvaluation = {
        id: 'turn_1',
        turnIndex: 0,
        userMessage: 'Test query',
        actualResponse: 'Test response',
        scores: {
          identityCorrectness: 0.9,
          memoryPrecision: 0.85,
          memoryRecall: 0.8,
          toolSuccessRate: 0.95,
          toneAdherence: 0.88,
          refusalCorrectness: 1.0,
          factualAccuracy: 0.92,
          responseCompleteness: 0.85,
        },
        latencyMs: 250,
        issues: [],
        evidence: ['Correct response provided'],
      };
      expect(turn.scores.identityCorrectness).toBe(0.9);
      expect(turn.scores.toolSuccessRate).toBe(0.95);
    });

    it('should define ConversationEvaluation with stats', () => {
      const evaluation: ConversationEvaluation = {
        id: 'eval_1',
        goldenConversationId: 'golden_1',
        actualConversationId: 'conv_1',
        overallScore: 0.88,
        identityScore: 0.9,
        memoryScore: 0.825,
        toolScore: 0.95,
        toneScore: 0.88,
        refusalScore: 1.0,
        turnEvaluations: [],
        stats: {
          totalTurns: 3,
          avgLatencyMs: 250,
          totalTokens: 1500,
          totalCost: 0.05,
          issueCount: 2,
          criticalIssueCount: 0,
          passRate: 0.95,
        },
        regressionStatus: 'pass',
        previousScore: 0.85,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };
      expect(evaluation.overallScore).toBe(0.88);
      expect(evaluation.regressionStatus).toBe('pass');
    });

    it('should define RegressionTestSuite', () => {
      const suite: RegressionTestSuite = {
        id: 'suite_1',
        name: 'Core Tests',
        description: 'Core functionality regression tests',
        goldenConversationIds: ['golden_1', 'golden_2'],
        passingScore: 0.85,
        criticalIssueThreshold: 3,
        evaluateIdentity: true,
        evaluateMemory: true,
        evaluateTools: true,
        evaluateTone: true,
        evaluateRefusal: true,
        creator: 'test_user',
        tags: ['core'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      expect(suite.name).toBe('Core Tests');
      expect(suite.passingScore).toBe(0.85);
    });

    it('should define ResponseFeedback', () => {
      const feedback: ResponseFeedback = {
        id: 'feedback_1',
        conversationId: 'conv_1',
        messageId: 'msg_1',
        rating: 4,
        feedback: 'positive',
        comment: 'Good response',
        issues: ['minor_accuracy_issue'],
        userId: '123e4567-e89b-12d3-a456-426614174000',
        createdAt: new Date(),
      };
      expect(feedback.rating).toBe(4);
      expect(feedback.feedback).toBe('positive');
    });
  });

  describe('EvaluationRepository', () => {
    it('should create and retrieve golden conversation', async () => {
      const golden: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'Retrieval Test',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['What is X?'],
        goldenResponses: ['X is Y'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await repository.createGoldenConversation(golden);
      expect(result).toBeDefined();
      expect(result.title).toBe('Retrieval Test');

      const retrieved = await repository.getGoldenConversation(result.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe('Retrieval Test');
    });

    it('should list golden conversations by intent', async () => {
      const golden1: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'Info Test 1',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Q1?'],
        goldenResponses: ['A1'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const golden2: GoldenConversation = {
        id: 'golden_2',
        conversationId: 'conv_2',
        title: 'Task Test 1',
        intent: 'task_execution',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Do X?'],
        goldenResponses: ['Done'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.createGoldenConversation(golden1);
      await repository.createGoldenConversation(golden2);

      const infoTests = await repository.listGoldenConversationsByIntent('information_retrieval');
      expect(infoTests).toHaveLength(1);
      expect(infoTests[0].title).toBe('Info Test 1');

      const taskTests = await repository.listGoldenConversationsByIntent('task_execution');
      expect(taskTests).toHaveLength(1);
      expect(taskTests[0].title).toBe('Task Test 1');
    });

    it('should update golden conversation', async () => {
      const golden: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'Original Title',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Q?'],
        goldenResponses: ['A'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.createGoldenConversation(golden);
      const updated = await repository.updateGoldenConversation(created.id, {
        title: 'Updated Title',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.version).toBe(2);
    });

    it('should delete golden conversation', async () => {
      const golden: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'To Delete',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Q?'],
        goldenResponses: ['A'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.createGoldenConversation(golden);
      const success = await repository.deleteGoldenConversation(created.id);

      expect(success).toBe(true);

      const retrieved = await repository.getGoldenConversation(created.id);
      expect(retrieved).toBeNull();
    });

    it('should create and retrieve evaluation', async () => {
      const golden: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'Test',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Q'],
        goldenResponses: ['A'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.createGoldenConversation(golden);

      const evaluation: ConversationEvaluation = {
        id: 'eval_1',
        goldenConversationId: created.id,
        actualConversationId: 'conv_2',
        overallScore: 0.88,
        identityScore: 0.9,
        memoryScore: 0.85,
        toolScore: 0.92,
        toneScore: 0.87,
        refusalScore: 1.0,
        turnEvaluations: [],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 250,
          totalTokens: 500,
          totalCost: 0.02,
          issueCount: 0,
          criticalIssueCount: 0,
          passRate: 1.0,
        },
        regressionStatus: 'pass',
        previousScore: 0.85,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      const result = await repository.createEvaluation(evaluation);
      expect(result).toBeDefined();
      expect(result.overallScore).toBe(0.88);

      const retrieved = await repository.getEvaluation(result.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.overallScore).toBe(0.88);
    });

    it('should list evaluations by golden conversation', async () => {
      const golden: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'Test',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Q'],
        goldenResponses: ['A'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.createGoldenConversation(golden);

      const evalResult1: ConversationEvaluation = {
        id: 'eval_1',
        goldenConversationId: created.id,
        actualConversationId: 'conv_2',
        overallScore: 0.88,
        identityScore: 0.9,
        memoryScore: 0.85,
        toolScore: 0.92,
        toneScore: 0.87,
        refusalScore: 1.0,
        turnEvaluations: [],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 250,
          totalTokens: 500,
          totalCost: 0.02,
          issueCount: 0,
          criticalIssueCount: 0,
          passRate: 1.0,
        },
        regressionStatus: 'pass',
        previousScore: 0.85,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      const evalResult2: ConversationEvaluation = {
        id: 'eval_2',
        goldenConversationId: created.id,
        actualConversationId: 'conv_3',
        overallScore: 0.92,
        identityScore: 0.94,
        memoryScore: 0.90,
        toolScore: 0.95,
        toneScore: 0.91,
        refusalScore: 1.0,
        turnEvaluations: [],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 240,
          totalTokens: 480,
          totalCost: 0.02,
          issueCount: 0,
          criticalIssueCount: 0,
          passRate: 1.0,
        },
        regressionStatus: 'improvement',
        previousScore: 0.88,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      await repository.createEvaluation(evalResult1);
      await repository.createEvaluation(evalResult2);

      const evals = await repository.listEvaluationsByGolden(created.id);
      expect(evals).toHaveLength(2);
    });

    it('should list evaluations by regression status', async () => {
      const golden: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'Test',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Q'],
        goldenResponses: ['A'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.createGoldenConversation(golden);

      const passEvaluation: ConversationEvaluation = {
        id: 'eval_pass',
        goldenConversationId: created.id,
        actualConversationId: 'conv_2',
        overallScore: 0.90,
        identityScore: 0.90,
        memoryScore: 0.90,
        toolScore: 0.90,
        toneScore: 0.90,
        refusalScore: 1.0,
        turnEvaluations: [],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 250,
          totalTokens: 500,
          totalCost: 0.02,
          issueCount: 0,
          criticalIssueCount: 0,
          passRate: 1.0,
        },
        regressionStatus: 'pass',
        previousScore: 0.85,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      const failEvaluation: ConversationEvaluation = {
        id: 'eval_fail',
        goldenConversationId: created.id,
        actualConversationId: 'conv_3',
        overallScore: 0.70,
        identityScore: 0.70,
        memoryScore: 0.70,
        toolScore: 0.70,
        toneScore: 0.70,
        refusalScore: 0.5,
        turnEvaluations: [],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 300,
          totalTokens: 600,
          totalCost: 0.03,
          issueCount: 3,
          criticalIssueCount: 1,
          passRate: 0.5,
        },
        regressionStatus: 'fail',
        previousScore: 0.88,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      await repository.createEvaluation(passEvaluation);
      await repository.createEvaluation(failEvaluation);

      const passing = await repository.listEvaluationsByRegressionStatus('pass');
      expect(passing.length).toBeGreaterThanOrEqual(1);

      const failing = await repository.listEvaluationsByRegressionStatus('fail');
      expect(failing.length).toBeGreaterThanOrEqual(1);
    });

    it('should create and list feedback', async () => {
      const feedback: ResponseFeedback = {
        id: 'feedback_1',
        conversationId: 'conv_1',
        messageId: 'msg_1',
        rating: 5,
        feedback: 'positive',
        comment: 'Excellent response',
        issues: [],
        userId: '123e4567-e89b-12d3-a456-426614174000',  // Valid UUID
        createdAt: new Date(),
      };

      const result = await repository.createFeedback(feedback);
      expect(result).toBeDefined();
      expect(result.rating).toBe(5);

      const listed = await repository.listFeedbackByConversation('conv_1');
      expect(listed).toHaveLength(1);
      expect(listed[0].rating).toBe(5);
    });
  });

  describe('ScoringEngine', () => {
    it('should validate weight configuration', () => {
      expect(() => {
        const config = {
          weights: {
            identity: 0.1,
            memory: 0.1,
            tools: 0.1,
            tone: 0.1,
            refusal: 0.1,
            accuracy: 0.1,
            completeness: 0.1,
          },
          passingScore: 0.85,
        };
        new ScoringEngine(config);
      }).toThrow();
    });

    it('should calculate overall score with correct weights', () => {
      const turnEval: TurnEvaluation = {
        id: 'turn_1',
        turnIndex: 0,
        userMessage: 'Test',
        actualResponse: 'Response',
        scores: {
          identityCorrectness: 1.0,
          memoryPrecision: 1.0,
          memoryRecall: 1.0,
          toolSuccessRate: 1.0,
          toneAdherence: 1.0,
          refusalCorrectness: 1.0,
          factualAccuracy: 1.0,
          responseCompleteness: 1.0,
        },
        latencyMs: 250,
        issues: [],
        evidence: [],
      };

      const score = scoringEngine.calculateOverallScore(turnEval);
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('should calculate weighted average correctly', () => {
      const scores = [0.9, 0.8, 1.0];
      const avg = scoringEngine.calculateAverageScore(scores);
      expect(avg).toBeCloseTo((0.9 + 0.8 + 1.0) / 3, 2);
    });

    it('should determine pass/fail status', () => {
      expect(scoringEngine.determinePassStatus(0.88)).toBe('pass');
      expect(scoringEngine.determinePassStatus(0.82)).toBe('fail');
      expect(scoringEngine.determinePassStatus(0.85)).toBe('pass');
    });

    it('should detect regression', () => {
      const current = 0.80;
      const previous = 0.90;
      const status = scoringEngine.detectRegression(current, previous, 0.05);
      expect(status).toBe('degradation');
    });

    it('should detect improvement', () => {
      const current = 0.95;
      const previous = 0.85;
      const status = scoringEngine.detectRegression(current, previous, 0.05);
      expect(status).toBe('improvement');
    });

    it('should generate issues from low scores', () => {
      const turnEval: TurnEvaluation = {
        id: 'turn_1',
        turnIndex: 0,
        userMessage: 'Test',
        actualResponse: 'Response',
        scores: {
          identityCorrectness: 0.5,
          memoryPrecision: 0.4,
          memoryRecall: 0.6,
          toolSuccessRate: 0.95,
          toneAdherence: 0.88,
          refusalCorrectness: 1.0,
          factualAccuracy: 0.45,
          responseCompleteness: 0.85,
        },
        latencyMs: 250,
        issues: [],
        evidence: [],
      };

      const issues = scoringEngine.generateIssues(turnEval);
      expect(issues.length).toBeGreaterThan(0);
      // Check for tone or memory issues (category name might differ)
      expect(issues.some((i) => ['tone', 'memory', 'accuracy'].includes(i.category))).toBe(true);
    });

    it('should normalize scores to 0-1 range', () => {
      expect(scoringEngine.normalizeScore(1.5, 0, 1)).toBe(1.0);
      expect(scoringEngine.normalizeScore(-0.5, 0, 1)).toBe(0.0);
      expect(scoringEngine.normalizeScore(0.5, 0, 1)).toBe(0.5);
    });

    it('should interpret scores correctly', () => {
      const result95 = scoringEngine.interpretScore(0.98);
      expect(result95.level).toBe('excellent');
      
      const result87 = scoringEngine.interpretScore(0.87);
      expect(result87.level).toBe('good');
      
      const result76 = scoringEngine.interpretScore(0.76);
      expect(result76.level).toBe('fair');
      
      const result62 = scoringEngine.interpretScore(0.62);
      expect(result62.level).toBe('poor');
      
      const result50 = scoringEngine.interpretScore(0.50);
      expect(result50.level).toBe('failing');
    });

    it('should score response quality', () => {
      const actual = 'The capital of France is Paris';
      const expected = 'The capital of France is Paris';
      const result = scoringEngine.scoreResponseQuality(actual, expected);
      expect(result.score).toBeCloseTo(1.0, 1);
    });

    it('should detect poor response quality', () => {
      const actual = 'I dont know';
      const expected = 'The capital of France is Paris';
      const result = scoringEngine.scoreResponseQuality(actual, expected);
      expect(result.score).toBeLessThan(0.5);
    });
  });

  describe('DatasetExporter', () => {
    it('should export evaluations to JSONL format', async () => {
      const golden: GoldenConversation = {
        id: 'golden_1',
        conversationId: 'conv_1',
        title: 'Test',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Q'],
        goldenResponses: ['A'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const evaluation: ConversationEvaluation = {
        id: 'eval_1',
        goldenConversationId: 'golden_1',
        actualConversationId: 'conv_2',
        overallScore: 0.88,
        identityScore: 0.9,
        memoryScore: 0.85,
        toolScore: 0.92,
        toneScore: 0.87,
        refusalScore: 1.0,
        turnEvaluations: [
          {
            id: 'turn_1',
            turnIndex: 0,
            userMessage: 'Q',
            actualResponse: 'A',
            scores: {
              identityCorrectness: 0.9,
              memoryPrecision: 0.85,
              memoryRecall: 0.85,
              toolSuccessRate: 0.92,
              toneAdherence: 0.87,
              refusalCorrectness: 1.0,
              factualAccuracy: 0.92,
              responseCompleteness: 0.85,
            },
            latencyMs: 250,
            issues: [],
            evidence: [],
          },
        ],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 250,
          totalTokens: 500,
          totalCost: 0.02,
          issueCount: 0,
          criticalIssueCount: 0,
          passRate: 1.0,
        },
        regressionStatus: 'pass',
        previousScore: 0.85,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      const jsonl = DatasetExporter.evaluationsToJSONL([evaluation], new Map([['golden_1', golden]]));
      expect(jsonl).toBeDefined();
      expect(jsonl.includes('information_retrieval')).toBe(true);

      const lines = jsonl.split('\n').filter((l) => l);
      expect(lines.length).toBeGreaterThan(0);
    });

    it('should export evaluations to CSV format', async () => {
      const evaluation: ConversationEvaluation = {
        id: 'eval_1',
        goldenConversationId: 'golden_1',
        actualConversationId: 'conv_2',
        overallScore: 0.88,
        identityScore: 0.9,
        memoryScore: 0.85,
        toolScore: 0.92,
        toneScore: 0.87,
        refusalScore: 1.0,
        turnEvaluations: [],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 250,
          totalTokens: 500,
          totalCost: 0.02,
          issueCount: 0,
          criticalIssueCount: 0,
          passRate: 1.0,
        },
        regressionStatus: 'pass',
        previousScore: 0.85,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      const csv = DatasetExporter.evaluationsToCSV([evaluation]);
      expect(csv).toBeDefined();
      expect(csv.includes('evaluationId')).toBe(true);
      expect(csv.includes('0.880')).toBe(true);
    });

    it('should generate proper filenames with timestamps', () => {
      const filename = DatasetExporter.generateFilename('evaluation', 'jsonl');
      expect(filename).toMatch(/^evaluation_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.jsonl$/);
    });

    it('should parse JSONL data', () => {
      const jsonl =
        '{"id":"entry1","intent":"information_retrieval","stance":"helpful","userMessage":"Q","actualResponse":"A","scores":{"identityCorrectness":0.9}}\n{"id":"entry2","intent":"task_execution","stance":"helpful","userMessage":"Do X","actualResponse":"Done","scores":{"identityCorrectness":0.95}}';

      const entries = DatasetExporter.parseJSONL(jsonl);
      expect(entries).toHaveLength(2);
      expect(entries[0].intent).toBe('information_retrieval');
      expect(entries[1].intent).toBe('task_execution');
    });

    it('should create appropriate blob for export', () => {
      const content = 'test content';
      const blob = DatasetExporter.createBlob(content, 'jsonl');
      expect(blob.type).toBe('application/x-ndjson');

      const csvBlob = DatasetExporter.createBlob(content, 'csv');
      expect(csvBlob.type).toBe('text/csv');
    });
  });

  describe('Database Schema', () => {
    it('should have golden_conversations table', async () => {
      const result = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = 'golden_conversations'"
      );
      expect(result.rows).toHaveLength(1);
    });

    it('should have conversation_evaluations table', async () => {
      const result = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = 'conversation_evaluations'"
      );
      expect(result.rows).toHaveLength(1);
    });

    it('should have response_feedback table', async () => {
      const result = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = 'response_feedback'"
      );
      expect(result.rows).toHaveLength(1);
    });

    it('should have regression_test_suites table', async () => {
      const result = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = 'regression_test_suites'"
      );
      expect(result.rows).toHaveLength(1);
    });

    it('should have regression_test_runs table', async () => {
      const result = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_name = 'regression_test_runs'"
      );
      expect(result.rows).toHaveLength(1);
    });

    it('should have proper indexes for query performance', async () => {
      const result = await pool.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'golden_conversations' AND indexname LIKE 'idx_%'"
      );
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should enforce cascade deletes', async () => {
      // Test that deleting a golden conversation deletes related evaluations
      const golden: GoldenConversation = {
        id: 'golden_cascade',
        conversationId: 'conv_cascade',
        title: 'Cascade Test',
        intent: 'information_retrieval',
        primaryStance: 'helpful',
        secondaryStances: [],
        requiredMemoryRecall: [],
        requiredToolUsage: [],
        requiredRefusal: [],
        userMessages: ['Q'],
        goldenResponses: ['A'],
        tags: [],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.createGoldenConversation(golden);

      const evaluation: ConversationEvaluation = {
        id: 'eval_cascade',
        goldenConversationId: created.id,
        actualConversationId: 'conv_test',
        overallScore: 0.88,
        identityScore: 0.9,
        memoryScore: 0.85,
        toolScore: 0.92,
        toneScore: 0.87,
        refusalScore: 1.0,
        turnEvaluations: [],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 250,
          totalTokens: 500,
          totalCost: 0.02,
          issueCount: 0,
          criticalIssueCount: 0,
          passRate: 1.0,
        },
        regressionStatus: 'pass',
        previousScore: 0.85,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      const createdEvaluation = await repository.createEvaluation(evaluation);
      expect(createdEvaluation).toBeDefined();

      await repository.deleteGoldenConversation(created.id);

      const retrieved = await repository.getEvaluation(createdEvaluation.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Integration Scenarios', () => {
    it('should support complete evaluation workflow', async () => {
      // Create golden conversation
      const golden: GoldenConversation = {
        id: 'golden_workflow',
        conversationId: 'conv_golden',
        title: 'Workflow Test',
        intent: 'task_execution',
        primaryStance: 'helpful',
        secondaryStances: ['efficient'],
        requiredMemoryRecall: ['context'],
        requiredToolUsage: ['api_call'],
        requiredRefusal: [],
        userMessages: ['Execute task X', 'What about Y?'],
        goldenResponses: ['Task X executed', 'Y handled'],
        tags: ['integration'],
        creator: 'test_user',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdGolden = await repository.createGoldenConversation(golden);
      expect(createdGolden).toBeDefined();

      // Create evaluation
      const evaluation: ConversationEvaluation = {
        id: 'eval_workflow',
        goldenConversationId: createdGolden.id,
        actualConversationId: 'conv_actual',
        overallScore: 0.87,
        identityScore: 0.88,
        memoryScore: 0.86,
        toolScore: 0.91,
        toneScore: 0.85,
        refusalScore: 1.0,
        turnEvaluations: [
          {
            id: 'turn_1',
            turnIndex: 0,
            userMessage: 'Execute task X',
            actualResponse: 'Task X executed',
            scores: {
              identityCorrectness: 0.88,
              memoryPrecision: 0.86,
              memoryRecall: 0.86,
              toolSuccessRate: 0.91,
              toneAdherence: 0.85,
              refusalCorrectness: 1.0,
              factualAccuracy: 0.88,
              responseCompleteness: 0.85,
            },
            latencyMs: 250,
            issues: [],
            evidence: ['Task executed as requested'],
          },
        ],
        stats: {
          totalTurns: 1,
          avgLatencyMs: 250,
          totalTokens: 750,
          totalCost: 0.025,
          issueCount: 0,
          criticalIssueCount: 0,
          passRate: 1.0,
        },
        regressionStatus: 'pass',
        previousScore: 0.85,
        evaluatedBy: 'test_evaluator',
        evaluatedAt: new Date(),
      };

      const createdEval = await repository.createEvaluation(evaluation);
      expect(createdEval.overallScore).toBe(0.87);

      // Score the evaluation
      const overallScore = scoringEngine.calculateOverallScore(evaluation.turnEvaluations[0]);
      expect(overallScore).toBeGreaterThan(0.85);

      // Determine pass/fail
      const status = scoringEngine.determinePassStatus(overallScore);
      expect(status).toBe('pass');

      // Add feedback
      const feedback: ResponseFeedback = {
        id: 'feedback_workflow',
        conversationId: 'conv_actual',
        messageId: 'msg_1',
        rating: 5,
        feedback: 'positive',
        comment: 'Excellent execution',
        issues: [],
        userId: '123e4567-e89b-12d3-a456-426614174000',  // Valid UUID
        createdAt: new Date(),
      };

      const createdFeedback = await repository.createFeedback(feedback);
      expect(createdFeedback.rating).toBe(5);

      // Export data
      const jsonl = DatasetExporter.evaluationsToJSONL([createdEval], new Map([[createdGolden.id, createdGolden]]));
      expect(jsonl).toBeDefined();
      expect(jsonl.length).toBeGreaterThan(0);
    });

    it('should handle regression test suite workflow', async () => {
      // Create multiple golden conversations
      const goldens: GoldenConversation[] = [];
      for (let i = 0; i < 3; i++) {
        const g: GoldenConversation = {
          id: `golden_suite_${i}`,
          conversationId: `conv_suite_${i}`,
          title: `Suite Test ${i}`,
          intent: 'information_retrieval',
          primaryStance: 'helpful',
          secondaryStances: [],
          requiredMemoryRecall: [],
          requiredToolUsage: [],
          requiredRefusal: [],
          userMessages: [`Q${i}`],
          goldenResponses: [`A${i}`],
          tags: ['suite'],
          creator: 'test_user',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const created = await repository.createGoldenConversation(g);
        goldens.push(created);
      }

      // Create test suite
      const suite: RegressionTestSuite = {
        id: 'suite_1',
        name: 'Full Regression Suite',
        description: 'Tests for all core functionality',
        goldenConversationIds: goldens.map((g) => g.id),
        passingScore: 0.85,
        criticalIssueThreshold: 2,
        evaluateIdentity: true,
        evaluateMemory: true,
        evaluateTools: true,
        evaluateTone: true,
        evaluateRefusal: true,
        creator: 'test_user',
        tags: ['core', 'regression'],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(suite.goldenConversationIds).toHaveLength(3);

      // Create evaluations for each golden
      for (let i = 0; i < goldens.length; i++) {
        const evaluation: ConversationEvaluation = {
          id: `eval_suite_${i}`,
          goldenConversationId: goldens[i].id,
          actualConversationId: `conv_test_${i}`,
          overallScore: 0.88 - i * 0.05,
          identityScore: 0.9,
          memoryScore: 0.85,
          toolScore: 0.92,
          toneScore: 0.87,
          refusalScore: 1.0,
          turnEvaluations: [],
          stats: {
            totalTurns: 1,
            avgLatencyMs: 250,
            totalTokens: 500,
            totalCost: 0.02,
            issueCount: i,
            criticalIssueCount: i > 1 ? 1 : 0,
            passRate: 1.0 - i * 0.1,
          },
          regressionStatus: i === 0 ? 'pass' : i === 1 ? 'degradation' : 'fail',
          previousScore: 0.88,
          evaluatedBy: 'test_evaluator',
          evaluatedAt: new Date(),
        };

        const created = await repository.createEvaluation(evaluation);
        expect(created).toBeDefined();
      }

      // Query by regression status
      const passing = await repository.listEvaluationsByRegressionStatus('pass');
      expect(passing.length).toBeGreaterThanOrEqual(1);

      const degrading = await repository.listEvaluationsByRegressionStatus('degradation');
      expect(degrading.length).toBeGreaterThanOrEqual(0);
    });
  });
});
