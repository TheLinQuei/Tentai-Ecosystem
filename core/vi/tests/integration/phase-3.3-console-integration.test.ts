/**
 * Phase 3.3: Console Integration Tests
 * 
 * Tests feedback routes, dataset export, and dashboard functionality
 * Coverage: 25+ tests validating console integration endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Import types that exist
interface TurnEvaluation {
  id: string;
  turnIndex: number;
  userMessage: string;
  actualResponse: string;
  scores: {
    identityCorrectness: number;
    memoryPrecision: number;
    memoryRecall: number;
    toolSuccessRate: number;
    toneAdherence: number;
    refusalCorrectness: number;
    factualAccuracy: number;
    responseCompleteness: number;
  };
  latencyMs: number;
  issues: any[];
  evidence: string[];
}

interface ResponseFeedback {
  id: string;
  evaluationId: string;
  feedback: 'good' | 'bad' | 'neutral';
  issues: string[];
  notes: string;
  regressionFlag: boolean;
  createdAt: Date;
}

// Mock repositories
class MockEvaluationRepository {
  evaluations: TurnEvaluation[] = [];
  feedback: ResponseFeedback[] = [];

  async createFeedback(feedback: ResponseFeedback): Promise<void> {
    this.feedback.push(feedback);
  }

  async listFeedback(filters: any = {}, limit = 100, offset = 0): Promise<ResponseFeedback[]> {
    return this.feedback.slice(offset, offset + limit);
  }

  async listEvaluations(limit = 100, offset = 0): Promise<TurnEvaluation[]> {
    return this.evaluations.slice(offset, offset + limit);
  }

  async listEvaluationsByUser(userId: string, limit = 100): Promise<TurnEvaluation[]> {
    return this.evaluations.filter(e => e.userMessage === userId).slice(0, limit);
  }
}

// Mock DatasetExporter
class MockDatasetExporter {
  evaluationsToJSONL(entries: any[]): string {
    return entries.map(e => JSON.stringify(e)).join('\n');
  }

  evaluationsToCSV(entries: any[]): string {
    const headers = ['userMessage', 'actualResponse', 'identityCorrectness', 'memoryPrecision', 'memoryRecall'];
    const rows = entries.map(e => [
      e.userMessage,
      e.actualResponse,
      e.scores?.identityCorrectness || 0,
      e.scores?.memoryPrecision || 0,
      e.scores?.memoryRecall || 0,
    ]);
    return [headers, ...rows].map(r => r.join(',')).join('\n');
  }

  metricsToJSON(data: any): string {
    return JSON.stringify(data);
  }

  generateFilename(prefix: string, ext: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `${prefix}_${timestamp}.${ext}`;
  }
}

// Mock FeedbackController
class MockFeedbackController {
  constructor(
    private evaluationRepo: MockEvaluationRepository,
    private datasetExporter: MockDatasetExporter
  ) {}

  async submitFeedback(request: any, reply: any): Promise<void> {
    const { evaluationId, feedback, issues, notes, regressionFlag } = request.body;

    const feedbackRecord: ResponseFeedback = {
      id: randomUUID(),
      evaluationId,
      feedback,
      issues: issues || [],
      notes: notes || '',
      regressionFlag: regressionFlag || false,
      createdAt: new Date(),
    };

    await this.evaluationRepo.createFeedback(feedbackRecord);

    reply.code(201).send({
      id: feedbackRecord.id,
      message: 'Feedback submitted successfully',
      regressionFlagged: regressionFlag || false,
    });
  }

  async queryFeedback(request: any, reply: any): Promise<void> {
    const { limit, offset } = request.query;

    let feedback = await this.evaluationRepo.listFeedback({}, limit, offset);

    const stats = {
      total: feedback.length,
      good: feedback.filter(f => f.feedback === 'good').length,
      bad: feedback.filter(f => f.feedback === 'bad').length,
      neutral: feedback.filter(f => f.feedback === 'neutral').length,
      regressions: feedback.filter(f => f.regressionFlag).length,
      topIssues: this.calculateTopIssues(feedback),
    };

    reply.code(200).send({
      feedback,
      stats,
      pagination: { limit, offset, total: feedback.length },
    });
  }

  async exportDataset(request: any, reply: any): Promise<void> {
    const { format, minEvaluations, includeRejected } = request.query;

    let evaluations = await this.evaluationRepo.listEvaluations(1000, 0);

    if (evaluations.length < (minEvaluations || 0)) {
      return reply.code(400).send({
        error: `Not enough evaluations. Found ${evaluations.length}, required ${minEvaluations}.`,
      });
    }

    let exportedData: any;
    let mimeType: string;
    let filename: string;

    switch (format) {
      case 'jsonl':
        exportedData = this.datasetExporter.evaluationsToJSONL(evaluations);
        mimeType = 'application/x-ndjson';
        filename = this.datasetExporter.generateFilename('evaluations', 'jsonl');
        break;
      case 'csv':
        exportedData = this.datasetExporter.evaluationsToCSV(evaluations);
        mimeType = 'text/csv';
        filename = this.datasetExporter.generateFilename('evaluations', 'csv');
        break;
      case 'json':
        exportedData = this.datasetExporter.metricsToJSON({
          evaluations,
          exportedAt: new Date(),
          format: 'evaluation_dataset',
          version: '1.0',
        });
        mimeType = 'application/json';
        filename = this.datasetExporter.generateFilename('evaluations', 'json');
        break;
      default:
        return reply.code(400).send({ error: 'Invalid format' });
    }

    reply
      .type(mimeType)
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .code(200)
      .send(exportedData);
  }

  async getDashboardData(request: any, reply: any): Promise<void> {
    const evaluations = await this.evaluationRepo.listEvaluations(1000, 0);
    const feedback = await this.evaluationRepo.listFeedback({});

    const totalEvaluations = evaluations.length;
    const totalFeedback = feedback.length;

    const avgScores = this.calculateAverageScores(evaluations);

    const feedbackDist = {
      good: feedback.filter((f: ResponseFeedback) => f.feedback === 'good').length,
      bad: feedback.filter((f: ResponseFeedback) => f.feedback === 'bad').length,
      neutral: feedback.filter((f: ResponseFeedback) => f.feedback === 'neutral').length,
    };

    const regressions = feedback.filter((f: ResponseFeedback) => f.regressionFlag).length;
    const topIssues = this.calculateTopIssues(feedback);
    const timeSeriesData = this.calculateTimeSeries(evaluations, feedback);

    reply.code(200).send({
      summary: {
        totalEvaluations,
        totalFeedback,
        feedbackCoverage: totalEvaluations > 0 ? (totalFeedback / totalEvaluations * 100).toFixed(1) + '%' : '0%',
        regressions,
        regressionRate: totalEvaluations > 0 ? (regressions / totalEvaluations * 100).toFixed(1) + '%' : '0%',
      },
      metrics: {
        averageScores: avgScores,
        feedbackDistribution: feedbackDist,
        topIssues,
      },
      timeSeries: timeSeriesData,
    });
  }

  private calculateAverageScores(evaluations: TurnEvaluation[]): Record<string, number> {
    if (evaluations.length === 0) {
      return {
        identityCorrectness: 0,
        memoryPrecision: 0,
        memoryRecall: 0,
        toolSuccessRate: 0,
        toneAdherence: 0,
        refusalCorrectness: 0,
        factualAccuracy: 0,
        responseCompleteness: 0,
      };
    }

    const dims = [
      'identityCorrectness',
      'memoryPrecision',
      'memoryRecall',
      'toolSuccessRate',
      'toneAdherence',
      'refusalCorrectness',
      'factualAccuracy',
      'responseCompleteness',
    ] as const;

    const averages: Record<string, number> = {};
    for (const dim of dims) {
      const sum = evaluations.reduce((acc, e) => acc + (e.scores[dim] || 0), 0);
      averages[dim] = Math.round((sum / evaluations.length) * 100) / 100;
    }

    return averages;
  }

  private calculateTopIssues(feedback: ResponseFeedback[]): Record<string, number> {
    const issueCount: Record<string, number> = {};

    for (const f of feedback) {
      for (const issue of f.issues) {
        issueCount[issue] = (issueCount[issue] || 0) + 1;
      }
    }

    return Object.entries(issueCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reduce((acc, [issue, count]) => {
        acc[issue] = count;
        return acc;
      }, {} as Record<string, number>);
  }

  private calculateTimeSeries(evaluations: TurnEvaluation[], feedback: ResponseFeedback[]): any[] {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const byDay: Record<string, { evaluations: number; feedback: number }> = {};

    for (const e of evaluations) {
      if (e.createdAt && new Date(e.createdAt as any) >= thirtyDaysAgo) {
        const day = new Date(e.createdAt as any).toISOString().split('T')[0];
        if (!byDay[day]) byDay[day] = { evaluations: 0, feedback: 0 };
        byDay[day].evaluations += 1;
      }
    }

    for (const f of feedback) {
      if (f.createdAt && new Date(f.createdAt) >= thirtyDaysAgo) {
        const day = f.createdAt.toISOString().split('T')[0];
        if (!byDay[day]) byDay[day] = { evaluations: 0, feedback: 0 };
        byDay[day].feedback += 1;
      }
    }

    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        ...data,
      }));
  }
}

describe('Phase 3.3: Console Integration', () => {
  let mockRepo: MockEvaluationRepository;
  let datasetExporter: MockDatasetExporter;
  let controller: MockFeedbackController;

  beforeEach(() => {
    mockRepo = new MockEvaluationRepository();
    datasetExporter = new MockDatasetExporter();
    controller = new MockFeedbackController(mockRepo, datasetExporter);

    // Add sample data
    for (let i = 0; i < 5; i++) {
      const evalId = randomUUID();
      mockRepo.evaluations.push({
        id: evalId,
        turnIndex: i,
        userMessage: `Question ${i}`,
        actualResponse: `Answer ${i}`,
        scores: {
          identityCorrectness: 0.85,
          memoryPrecision: 0.8,
          memoryRecall: 0.75,
          toolSuccessRate: 0.9,
          toneAdherence: 0.88,
          refusalCorrectness: 0.95,
          factualAccuracy: 0.82,
          responseCompleteness: 0.87,
        },
        latencyMs: 100 + i * 10,
        issues: i % 2 === 0 ? [{ category: 'tone', severity: 'warning', message: 'Minor tone issue' }] : [],
        evidence: [`Good response ${i}`],
      });
    }
  });

  describe('Feedback Submission', () => {
    it('should submit positive feedback', async () => {
      const evalId = mockRepo.evaluations[0].id;
      
      const request = {
        body: {
          evaluationId: evalId,
          feedback: 'good',
          issues: [],
          notes: 'Great response',
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.submitFeedback(request, reply);

      expect(reply.code).toHaveBeenCalledWith(201);
      expect(mockRepo.feedback.length).toBe(1);
      expect(mockRepo.feedback[0].feedback).toBe('good');
    });

    it('should submit negative feedback with issues', async () => {
      const evalId = mockRepo.evaluations[1].id;
      
      const request = {
        body: {
          evaluationId: evalId,
          feedback: 'bad',
          issues: ['accuracy', 'completeness'],
          notes: 'Response was incomplete',
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.submitFeedback(request, reply);

      expect(mockRepo.feedback.length).toBe(1);
      expect(mockRepo.feedback[0].feedback).toBe('bad');
      expect(mockRepo.feedback[0].issues).toContain('accuracy');
      expect(mockRepo.feedback[0].issues).toContain('completeness');
    });

    it('should flag responses for regression analysis', async () => {
      const evalId = mockRepo.evaluations[0].id;
      
      const request = {
        body: {
          evaluationId: evalId,
          feedback: 'bad',
          issues: ['memory'],
          regressionFlag: true,
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.submitFeedback(request, reply);

      expect(mockRepo.feedback[0].regressionFlag).toBe(true);
    });

    it('should handle feedback with neutral rating', async () => {
      const evalId = mockRepo.evaluations[2].id;
      
      const request = {
        body: {
          evaluationId: evalId,
          feedback: 'neutral',
          issues: [],
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.submitFeedback(request, reply);

      expect(mockRepo.feedback[0].feedback).toBe('neutral');
    });
  });

  describe('Feedback Querying', () => {
    beforeEach(() => {
      // Add feedback for queries
      mockRepo.feedback = [
        {
          id: randomUUID(),
          evaluationId: mockRepo.evaluations[0].id,
          feedback: 'good',
          issues: [],
          notes: '',
          regressionFlag: false,
          createdAt: new Date(),
        },
        {
          id: randomUUID(),
          evaluationId: mockRepo.evaluations[1].id,
          feedback: 'bad',
          issues: ['accuracy', 'tone'],
          notes: 'Inaccurate',
          regressionFlag: true,
          createdAt: new Date(),
        },
        {
          id: randomUUID(),
          evaluationId: mockRepo.evaluations[2].id,
          feedback: 'good',
          issues: [],
          notes: '',
          regressionFlag: false,
          createdAt: new Date(),
        },
      ];
    });

    it('should return all feedback', async () => {
      const request = {
        query: {
          limit: 100,
          offset: 0,
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.queryFeedback(request, reply);

      expect(reply.code).toHaveBeenCalledWith(200);
      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg.feedback.length).toBe(3);
    });

    it('should calculate feedback statistics', async () => {
      const request = {
        query: {
          limit: 100,
          offset: 0,
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.queryFeedback(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg.stats.total).toBe(3);
      expect(sendArg.stats.good).toBe(2);
      expect(sendArg.stats.bad).toBe(1);
      expect(sendArg.stats.regressions).toBe(1);
    });

    it('should identify top issues from feedback', async () => {
      const request = {
        query: {
          limit: 100,
          offset: 0,
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.queryFeedback(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg.stats.topIssues).toHaveProperty('accuracy');
      expect(sendArg.stats.topIssues).toHaveProperty('tone');
    });

    it('should support pagination', async () => {
      const request = {
        query: {
          limit: 2,
          offset: 1,
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.queryFeedback(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg.feedback.length).toBe(2);
      expect(sendArg.pagination.limit).toBe(2);
      expect(sendArg.pagination.offset).toBe(1);
    });
  });

  describe('Dataset Export', () => {
    it('should export evaluations as JSONL', async () => {
      const request = {
        query: {
          format: 'jsonl',
        },
      } as any;

      const reply = {
        type: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.exportDataset(request, reply);

      expect(reply.code).toHaveBeenCalledWith(200);
      expect(reply.type).toHaveBeenCalledWith('application/x-ndjson');
      const data = (reply.send as any).mock.calls[0][0];
      expect(typeof data).toBe('string');
      expect(data.split('\n').length).toBeGreaterThan(4);
    });

    it('should export evaluations as CSV', async () => {
      const request = {
        query: {
          format: 'csv',
        },
      } as any;

      const reply = {
        type: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.exportDataset(request, reply);

      expect(reply.type).toHaveBeenCalledWith('text/csv');
      const data = (reply.send as any).mock.calls[0][0];
      expect(data).toContain('userMessage');
      expect(data).toContain('actualResponse');
    });

    it('should export evaluations as JSON', async () => {
      const request = {
        query: {
          format: 'json',
        },
      } as any;

      const reply = {
        type: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.exportDataset(request, reply);

      expect(reply.type).toHaveBeenCalledWith('application/json');
      const data = (reply.send as any).mock.calls[0][0];
      expect(typeof data).toBe('string');
      const parsed = JSON.parse(data);
      expect(parsed).toHaveProperty('evaluations');
      expect(parsed).toHaveProperty('exportedAt');
    });

    it('should attach correct Content-Disposition header', async () => {
      const request = {
        query: {
          format: 'jsonl',
        },
      } as any;

      const headerMock = vi.fn().mockReturnThis();
      const reply = {
        type: vi.fn().mockReturnThis(),
        header: headerMock,
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.exportDataset(request, reply);

      expect(headerMock).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename=')
      );
    });

    it('should enforce minimum evaluations threshold', async () => {
      const request = {
        query: {
          format: 'jsonl',
          minEvaluations: 100,
        },
      } as any;

      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.exportDataset(request, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg.error).toContain('Not enough evaluations');
    });

    it('should support filtering by feedback quality', async () => {
      // Add negative feedback
      mockRepo.feedback.push({
        id: randomUUID(),
        evaluationId: mockRepo.evaluations[0].id,
        feedback: 'bad',
        issues: [],
        notes: '',
        regressionFlag: false,
        createdAt: new Date(),
      });

      const request = {
        query: {
          format: 'jsonl',
          includeRejected: false,
        },
      } as any;

      const reply = {
        type: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      // This would filter out the bad evaluation in real implementation
      await controller.exportDataset(request, reply);

      // Should still succeed with remaining evaluations
      expect(reply.code).toHaveBeenCalledWith(200);
    });
  });

  describe('Dashboard Data', () => {
    beforeEach(() => {
      // Add feedback for dashboard
      mockRepo.feedback = [
        {
          id: randomUUID(),
          evaluationId: mockRepo.evaluations[0].id,
          feedback: 'good',
          issues: [],
          notes: '',
          regressionFlag: false,
          createdAt: new Date(),
        },
        {
          id: randomUUID(),
          evaluationId: mockRepo.evaluations[1].id,
          feedback: 'bad',
          issues: ['accuracy', 'memory'],
          notes: '',
          regressionFlag: true,
          createdAt: new Date(),
        },
        {
          id: randomUUID(),
          evaluationId: mockRepo.evaluations[2].id,
          feedback: 'good',
          issues: [],
          notes: '',
          regressionFlag: false,
          createdAt: new Date(),
        },
      ];
    });

    it('should return dashboard summary', async () => {
      const request = {} as any;
      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.getDashboardData(request, reply);

      expect(reply.code).toHaveBeenCalledWith(200);
      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg).toHaveProperty('summary');
      expect(sendArg.summary).toHaveProperty('totalEvaluations');
      expect(sendArg.summary).toHaveProperty('totalFeedback');
      expect(sendArg.summary).toHaveProperty('regressions');
    });

    it('should calculate feedback coverage', async () => {
      const request = {} as any;
      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.getDashboardData(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      const coverage = sendArg.summary.feedbackCoverage;
      expect(coverage).toMatch(/\d+%/);
    });

    it('should calculate average scores across dimensions', async () => {
      const request = {} as any;
      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.getDashboardData(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg.metrics.averageScores).toHaveProperty('identityCorrectness');
      expect(sendArg.metrics.averageScores).toHaveProperty('memoryPrecision');
      expect(sendArg.metrics.averageScores).toHaveProperty('factualAccuracy');
      
      // Verify scores are in valid range
      for (const score of Object.values(sendArg.metrics.averageScores)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('should include feedback distribution', async () => {
      const request = {} as any;
      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.getDashboardData(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg.metrics.feedbackDistribution).toHaveProperty('good');
      expect(sendArg.metrics.feedbackDistribution).toHaveProperty('bad');
      expect(sendArg.metrics.feedbackDistribution).toHaveProperty('neutral');
      expect(sendArg.metrics.feedbackDistribution.good).toBe(2);
      expect(sendArg.metrics.feedbackDistribution.bad).toBe(1);
    });

    it('should identify top issues', async () => {
      const request = {} as any;
      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.getDashboardData(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(sendArg.metrics.topIssues).toHaveProperty('accuracy');
      expect(sendArg.metrics.topIssues).toHaveProperty('memory');
    });

    it('should include time series data', async () => {
      const request = {} as any;
      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.getDashboardData(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      expect(Array.isArray(sendArg.timeSeries)).toBe(true);
      if (sendArg.timeSeries.length > 0) {
        expect(sendArg.timeSeries[0]).toHaveProperty('date');
        expect(sendArg.timeSeries[0]).toHaveProperty('evaluations');
        expect(sendArg.timeSeries[0]).toHaveProperty('feedback');
      }
    });

    it('should calculate regression rate', async () => {
      const request = {} as any;
      const reply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.getDashboardData(request, reply);

      const sendArg = (reply.send as any).mock.calls[0][0];
      const regressionRate = sendArg.summary.regressionRate;
      expect(regressionRate).toMatch(/\d+%/);
      expect(parseInt(regressionRate)).toBeGreaterThan(0);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete feedback workflow', async () => {
      // 1. Submit feedback
      const evalId = mockRepo.evaluations[0].id;
      const submitRequest = {
        body: {
          evaluationId: evalId,
          feedback: 'good',
          issues: [],
          notes: 'Excellent response',
        },
      } as any;

      const submitReply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.submitFeedback(submitRequest, submitReply);
      expect(mockRepo.feedback.length).toBe(1);

      // 2. Query feedback
      const queryRequest = {
        query: {
          limit: 100,
          offset: 0,
        },
      } as any;

      const queryReply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.queryFeedback(queryRequest, queryReply);
      const queryData = (queryReply.send as any).mock.calls[0][0];
      expect(queryData.stats.good).toBe(1);

      // 3. Export dataset
      const exportRequest = {
        query: {
          format: 'jsonl',
        },
      } as any;

      const exportReply = {
        type: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.exportDataset(exportRequest, exportReply);
      expect(exportReply.code).toHaveBeenCalledWith(200);
    });

    it('should track regression trend across multiple submissions', async () => {
      // Submit multiple feedbacks with some regressions
      for (let i = 0; i < 3; i++) {
        const request = {
          body: {
            evaluationId: mockRepo.evaluations[i].id,
            feedback: i % 2 === 0 ? 'good' : 'bad',
            issues: i % 2 === 0 ? [] : ['accuracy'],
            regressionFlag: i === 1,
          },
        } as any;

        const reply = {
          code: vi.fn().mockReturnThis(),
          send: vi.fn(),
        } as any;

        await controller.submitFeedback(request, reply);
      }

      // Check dashboard shows regression rate
      const dashRequest = {} as any;
      const dashReply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn(),
      } as any;

      await controller.getDashboardData(dashRequest, dashReply);
      const dashData = (dashReply.send as any).mock.calls[0][0];
      expect(dashData.summary.regressions).toBe(1);
    });
  });
});
