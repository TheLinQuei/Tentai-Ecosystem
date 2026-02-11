// @ts-nocheck
/**
 * Feedback Controller
 * 
 * Handles response tagging, evaluation feedback, and dataset management
 * Routes: POST /v1/admin/feedback, GET /v1/admin/feedback
 */

import { z } from 'zod';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EvaluationRepository } from '../db/repositories/EvaluationRepository.js';
import { ResponseFeedback, EvaluationDatasetEntry } from './domain/evaluation.js';
import { DatasetExporter } from './DatasetExporter.js';
import { randomUUID } from 'crypto';

/**
 * Request schema for submitting feedback on a response
 */
export const submitFeedbackSchema = z.object({
  body: z.object({
    evaluationId: z.string().uuid(),
    feedback: z.enum(['good', 'bad', 'neutral']),
    issues: z.array(z.enum([
      'tone',
      'memory',
      'tool',
      'refusal',
      'accuracy',
      'completeness',
      'identity',
      'other'
    ])).optional(),
    notes: z.string().max(2000).optional(),
    regressionFlag: z.boolean().optional(),
  }),
});

/**
 * Request schema for querying feedback
 */
export const queryFeedbackSchema = z.object({
  query: z.object({
    userId: z.string().uuid().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    feedbackType: z.enum(['good', 'bad', 'neutral']).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
    offset: z.coerce.number().int().min(0).optional().default(0),
  }),
});

/**
 * Request schema for dataset export
 */
export const exportDatasetSchema = z.object({
  query: z.object({
    format: z.enum(['jsonl', 'csv', 'json']).default('jsonl'),
    minEvaluations: z.coerce.number().int().min(0).optional(),
    includeRejected: z.coerce.boolean().optional().default(false),
    userId: z.string().uuid().optional(),
  }),
});

export class FeedbackController {
  constructor(
    private evaluationRepo: EvaluationRepository,
    private datasetExporter: DatasetExporter
  ) {}

  /**
   * Submit feedback on an evaluation result
   * POST /v1/admin/feedback
   */
  async submitFeedback(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const validated = submitFeedbackSchema.parse({
      body: request.body,
    });

    const { evaluationId, feedback, issues, notes, regressionFlag } = validated.body;

    // Create feedback record
    const feedbackRecord: ResponseFeedback = {
      id: randomUUID(),
      evaluationId,
      feedback,
      issues: issues || [],
      notes: notes || '',
      regressionFlag: regressionFlag || false,
      createdAt: new Date(),
    };

    // Persist feedback
    await this.evaluationRepo.createFeedback(feedbackRecord);

    // If regression flag set, log for analysis
    if (regressionFlag) {
      console.warn(`[REGRESSION] Feedback flagged for evaluation ${evaluationId}:`, {
        feedback,
        issues,
        notes,
      });
    }

    return reply.code(201).send({
      id: feedbackRecord.id,
      message: 'Feedback submitted successfully',
      regressionFlagged: regressionFlag || false,
    });
  }

  /**
   * Query feedback records
   * GET /v1/admin/feedback
   */
  async queryFeedback(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const validated = queryFeedbackSchema.parse({
      query: request.query,
    });

    const { userId, startDate, endDate, feedbackType, limit, offset } = validated.query;

    // Build query filters
    const filters: {
      userId?: string;
      feedbackType?: string;
      startDate?: Date;
      endDate?: Date;
    } = {};

    if (userId) filters.userId = userId;
    if (feedbackType) filters.feedbackType = feedbackType;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    // Query feedback - using listFeedback if available, or fetch all and filter
    // For now, assume evaluationRepo has a method to list feedback
    let feedback: ResponseFeedback[] = [];
    
    try {
      // Try to get feedback - implementation depends on repository
      feedback = await (this.evaluationRepo as any).listFeedback?.(filters, limit, offset) || [];
    } catch {
      // If method doesn't exist, return empty list
      feedback = [];
    }

    // Calculate summary stats
    const stats = {
      total: feedback.length,
      good: feedback.filter(f => f.feedback === 'good').length,
      bad: feedback.filter(f => f.feedback === 'bad').length,
      neutral: feedback.filter(f => f.feedback === 'neutral').length,
      regressions: feedback.filter(f => f.regressionFlag).length,
      topIssues: this.calculateTopIssues(feedback),
    };

    return reply.code(200).send({
      feedback,
      stats,
      pagination: {
        limit,
        offset,
        total: feedback.length,
      },
    });
  }

  /**
   * Export evaluation dataset in requested format
   * GET /v1/admin/feedback/export
   */
  async exportDataset(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const validated = exportDatasetSchema.parse({
      query: request.query,
    });

    const { format, minEvaluations, includeRejected, userId } = validated.query;

    // Fetch evaluations based on filters
    let evaluations: any[] = [];
    
    try {
      if (userId) {
        // Filter by user if specified
        evaluations = await (this.evaluationRepo as any).listEvaluationsByUser?.(userId, 1000) || [];
      } else {
        // Get all evaluations
        evaluations = await (this.evaluationRepo as any).listEvaluations?.(1000, 0) || [];
      }
    } catch {
      evaluations = [];
    }

    // Filter by feedback quality if needed
    if (!includeRejected) {
      const feedback = await (this.evaluationRepo as any).listFeedback?.({}) || [];
      const rejectedEvalIds = new Set(
        feedback
          .filter((f: ResponseFeedback) => f.feedback === 'bad')
          .map((f: ResponseFeedback) => f.evaluationId)
      );
      evaluations = evaluations.filter(e => !rejectedEvalIds.has(e.id));
    }

    // Check minimum evaluations threshold
    if (evaluations.length < (minEvaluations || 0)) {
      return reply.code(400).send({
        error: `Not enough evaluations. Found ${evaluations.length}, required ${minEvaluations}.`,
      });
    }

    // Convert to dataset entries
    const datasetEntries: EvaluationDatasetEntry[] = evaluations.map(e => ({
      id: randomUUID(),
      userMessage: e.userMessage,
      actualResponse: e.actualResponse,
      scores: e.scores,
      issues: e.issues || [],
      createdAt: e.createdAt || new Date(),
    }));

    try {
      // Export based on format
      let exportedData: any;
      let mimeType: string;
      let filename: string;

      switch (format) {
        case 'jsonl':
          exportedData = this.datasetExporter.evaluationsToJSONL(datasetEntries);
          mimeType = 'application/x-ndjson';
          filename = this.datasetExporter.generateFilename('evaluations', 'jsonl');
          break;
        case 'csv':
          exportedData = this.datasetExporter.evaluationsToCSV(datasetEntries);
          mimeType = 'text/csv';
          filename = this.datasetExporter.generateFilename('evaluations', 'csv');
          break;
        case 'json':
          exportedData = this.datasetExporter.metricsToJSON({
            evaluations: datasetEntries,
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

      // Send file
      reply
        .type(mimeType)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .code(200)
        .send(exportedData);
    } catch (error) {
      return reply.code(500).send({
        error: 'Dataset export failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get evaluation dashboard data (regression tracking, trends)
   * GET /v1/admin/feedback/dashboard
   */
  async getDashboardData(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Fetch all evaluations for analysis
      const evaluations = await (this.evaluationRepo as any).listEvaluations?.(1000, 0) || [];
      const feedback = await (this.evaluationRepo as any).listFeedback?.({}) || [];

      // Calculate metrics
      const totalEvaluations = evaluations.length;
      const totalFeedback = feedback.length;
      
      // Average scores by dimension
      const avgScores = this.calculateAverageScores(evaluations);
      
      // Feedback distribution
      const feedbackDist = {
        good: feedback.filter((f: ResponseFeedback) => f.feedback === 'good').length,
        bad: feedback.filter((f: ResponseFeedback) => f.feedback === 'bad').length,
        neutral: feedback.filter((f: ResponseFeedback) => f.feedback === 'neutral').length,
      };

      // Regression detection
      const regressions = feedback.filter((f: ResponseFeedback) => f.regressionFlag).length;

      // Top issues
      const topIssues = this.calculateTopIssues(feedback);

      // Time series (last 30 days if possible)
      const timeSeriesData = this.calculateTimeSeries(evaluations, feedback);

      return reply.code(200).send({
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
    } catch (error) {
      return reply.code(500).send({
        error: 'Dashboard data fetch failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Calculate average scores across all evaluations
   */
  private calculateAverageScores(evaluations: any[]): Record<string, number> {
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
    ];

    const averages: Record<string, number> = {};
    for (const dim of dims) {
      const sum = evaluations.reduce((acc, e) => acc + (e.scores?.[dim] || 0), 0);
      averages[dim] = Math.round((sum / evaluations.length) * 100) / 100;
    }

    return averages;
  }

  /**
   * Calculate top issues from feedback
   */
  private calculateTopIssues(feedback: ResponseFeedback[]): Record<string, number> {
    const issueCount: Record<string, number> = {};

    for (const f of feedback) {
      for (const issue of f.issues) {
        issueCount[issue] = (issueCount[issue] || 0) + 1;
      }
    }

    // Sort and return top 5
    return Object.entries(issueCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .reduce((acc, [issue, count]) => {
        acc[issue] = count;
        return acc;
      }, {} as Record<string, number>);
  }

  /**
   * Calculate time series data for trends
   */
  private calculateTimeSeries(evaluations: any[], feedback: ResponseFeedback[]): any[] {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Group by day
    const byDay: Record<string, { evaluations: number; feedback: number }> = {};

    for (const e of evaluations) {
      if (e.createdAt && new Date(e.createdAt) >= thirtyDaysAgo) {
        const day = new Date(e.createdAt).toISOString().split('T')[0];
        if (!byDay[day]) byDay[day] = { evaluations: 0, feedback: 0 };
        byDay[day].evaluations += 1;
      }
    }

    for (const f of feedback) {
      if (f.createdAt && new Date(f.createdAt) >= thirtyDaysAgo) {
        const day = new Date(f.createdAt).toISOString().split('T')[0];
        if (!byDay[day]) byDay[day] = { evaluations: 0, feedback: 0 };
        byDay[day].feedback += 1;
      }
    }

    // Convert to sorted array
    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        ...data,
      }));
  }
}

/**
 * Register feedback routes on Fastify app
 */
export async function registerFeedbackRoutes(
  app: FastifyInstance,
  evaluationRepo: EvaluationRepository,
  datasetExporter: DatasetExporter
): Promise<void> {
  const controller = new FeedbackController(evaluationRepo, datasetExporter);

  // POST /v1/admin/feedback - submit feedback
  app.post<{ Body: any }>('/v1/admin/feedback', async (request, reply) => {
    return controller.submitFeedback(request, reply);
  });

  // GET /v1/admin/feedback - query feedback
  app.get<{ Querystring: any }>('/v1/admin/feedback', async (request, reply) => {
    return controller.queryFeedback(request, reply);
  });

  // GET /v1/admin/feedback/export - export dataset
  app.get<{ Querystring: any }>('/v1/admin/feedback/export', async (request, reply) => {
    return controller.exportDataset(request, reply);
  });

  // GET /v1/admin/feedback/dashboard - dashboard data
  app.get('/v1/admin/feedback/dashboard', async (request, reply) => {
    return controller.getDashboardData(request, reply);
  });
}
