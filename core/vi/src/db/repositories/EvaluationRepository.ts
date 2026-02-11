/**
 * Evaluation Repository
 * 
 * Manages golden conversations, evaluation results, and regression test suites
 */

import { Pool } from 'pg';
import {
  GoldenConversation,
  ConversationEvaluation,
  RegressionTestSuite,
  RegressionTestRun,
  ResponseFeedback,
  TurnEvaluation,
} from '../../domain/evaluation';

export interface CreateGoldenConversationInput {
  conversationId: string;
  title: string;
  description: string;
  intent: string;
  primaryStance: string;
  secondaryStances?: string[];
  requiredMemoryRecall?: string[];
  requiredToolUsage?: string[];
  requiredRefusal?: string[];
  userMessages: string[];
  goldenResponses: string[];
  tags: string[];
  creator: string;
}

export interface CreateEvaluationInput {
  goldenConversationId: string;
  actualConversationId: string;
  overallScore: number;
  identityScore: number;
  memoryScore: number;
  toolScore: number;
  toneScore: number;
  refusalScore: number;
  turnEvaluations: TurnEvaluation[];
  stats: Record<string, unknown>;
  regressionStatus: string;
  previousScore?: number;
  evaluatedBy?: string;
}

export class EvaluationRepository {
  constructor(private pool: Pool) {}

  // Golden Conversations
  
  async createGoldenConversation(
    input: CreateGoldenConversationInput
  ): Promise<GoldenConversation> {
    const query = `
      INSERT INTO golden_conversations (
        conversation_id, title, description, intent, primary_stance,
        secondary_stances, required_memory_recall, required_tool_usage,
        required_refusal, user_messages, golden_responses, tags, creator,
        version, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, now(), now())
      RETURNING id, conversation_id, title, description, intent, primary_stance,
                secondary_stances, required_memory_recall, required_tool_usage,
                required_refusal, user_messages, golden_responses, tags, creator,
                version, created_at, updated_at
    `;

    const result = await this.pool.query<any>(query, [
      input.conversationId,
      input.title,
      input.description,
      input.intent,
      input.primaryStance,
      JSON.stringify(input.secondaryStances || []),
      JSON.stringify(input.requiredMemoryRecall || []),
      JSON.stringify(input.requiredToolUsage || []),
      JSON.stringify(input.requiredRefusal || []),
      JSON.stringify(input.userMessages),
      JSON.stringify(input.goldenResponses),
      JSON.stringify(input.tags),
      input.creator,
    ]);

    if (result.rows.length === 0) {
      throw new Error('Failed to create golden conversation');
    }

    return this.mapGoldenRow(result.rows[0]);
  }

  async getGoldenConversation(id: string): Promise<GoldenConversation | null> {
    const query = `
      SELECT id, conversation_id, title, description, intent, primary_stance,
             secondary_stances, required_memory_recall, required_tool_usage,
             required_refusal, user_messages, golden_responses, tags, creator,
             version, created_at, updated_at
      FROM golden_conversations
      WHERE id = $1
    `;

    const result = await this.pool.query<any>(query, [id]);
    return result.rows.length > 0 ? this.mapGoldenRow(result.rows[0]) : null;
  }

  async listGoldenConversations(
    limit: number = 100,
    offset: number = 0
  ): Promise<GoldenConversation[]> {
    const query = `
      SELECT id, conversation_id, title, description, intent, primary_stance,
             secondary_stances, required_memory_recall, required_tool_usage,
             required_refusal, user_messages, golden_responses, tags, creator,
             version, created_at, updated_at
      FROM golden_conversations
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await this.pool.query<any>(query, [limit, offset]);
    return result.rows.map((row) => this.mapGoldenRow(row));
  }

  async listGoldenConversationsByIntent(
    intent: string,
    limit: number = 100
  ): Promise<GoldenConversation[]> {
    const query = `
      SELECT id, conversation_id, title, description, intent, primary_stance,
             secondary_stances, required_memory_recall, required_tool_usage,
             required_refusal, user_messages, golden_responses, tags, creator,
             version, created_at, updated_at
      FROM golden_conversations
      WHERE intent = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query<any>(query, [intent, limit]);
    return result.rows.map((row) => this.mapGoldenRow(row));
  }

  async updateGoldenConversation(
    id: string,
    updates: Partial<CreateGoldenConversationInput>
  ): Promise<GoldenConversation> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }
    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.primaryStance !== undefined) {
      setClauses.push(`primary_stance = $${paramIndex++}`);
      values.push(updates.primaryStance);
    }

    setClauses.push(`version = version + 1`);
    setClauses.push(`updated_at = now()`);

    values.push(id);

    const query = `
      UPDATE golden_conversations
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, conversation_id, title, description, intent, primary_stance,
                secondary_stances, required_memory_recall, required_tool_usage,
                required_refusal, user_messages, golden_responses, tags, creator,
                version, created_at, updated_at
    `;

    const result = await this.pool.query<any>(query, values);
    if (result.rows.length === 0) {
      throw new Error('Golden conversation not found');
    }

    return this.mapGoldenRow(result.rows[0]);
  }

  async deleteGoldenConversation(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM golden_conversations WHERE id = $1', [id]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Evaluations

  async createEvaluation(input: CreateEvaluationInput): Promise<ConversationEvaluation> {
    const query = `
      INSERT INTO conversation_evaluations (
        golden_conversation_id, actual_conversation_id, overall_score,
        identity_score, memory_score, tool_score, tone_score, refusal_score,
        turn_evaluations, stats, regression_status, previous_score,
        evaluated_by, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
      RETURNING id, golden_conversation_id, actual_conversation_id, overall_score,
                identity_score, memory_score, tool_score, tone_score, refusal_score,
                turn_evaluations, stats, regression_status, previous_score,
                evaluated_by, created_at
    `;

    const result = await this.pool.query<any>(query, [
      input.goldenConversationId,
      input.actualConversationId,
      input.overallScore,
      input.identityScore,
      input.memoryScore,
      input.toolScore,
      input.toneScore,
      input.refusalScore,
      JSON.stringify(input.turnEvaluations),
      JSON.stringify(input.stats),
      input.regressionStatus,
      input.previousScore || null,
      input.evaluatedBy || null,
    ]);

    if (result.rows.length === 0) {
      throw new Error('Failed to create evaluation');
    }

    return this.mapEvaluationRow(result.rows[0]);
  }

  async getEvaluation(id: string): Promise<ConversationEvaluation | null> {
    const query = `
      SELECT id, golden_conversation_id, actual_conversation_id, overall_score,
             identity_score, memory_score, tool_score, tone_score, refusal_score,
             turn_evaluations, stats, regression_status, previous_score,
             evaluated_by, created_at
      FROM conversation_evaluations
      WHERE id = $1
    `;

    const result = await this.pool.query<any>(query, [id]);
    return result.rows.length > 0 ? this.mapEvaluationRow(result.rows[0]) : null;
  }

  async listEvaluationsByGolden(
    goldenId: string,
    limit: number = 50
  ): Promise<ConversationEvaluation[]> {
    const query = `
      SELECT id, golden_conversation_id, actual_conversation_id, overall_score,
             identity_score, memory_score, tool_score, tone_score, refusal_score,
             turn_evaluations, stats, regression_status, previous_score,
             evaluated_by, created_at
      FROM conversation_evaluations
      WHERE golden_conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query<any>(query, [goldenId, limit]);
    return result.rows.map((row) => this.mapEvaluationRow(row));
  }

  async listEvaluationsByRegressionStatus(
    status: string,
    limit: number = 50
  ): Promise<ConversationEvaluation[]> {
    const query = `
      SELECT id, golden_conversation_id, actual_conversation_id, overall_score,
             identity_score, memory_score, tool_score, tone_score, refusal_score,
             turn_evaluations, stats, regression_status, previous_score,
             evaluated_by, created_at
      FROM conversation_evaluations
      WHERE regression_status = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query<any>(query, [status, limit]);
    return result.rows.map((row) => this.mapEvaluationRow(row));
  }

  // Response Feedback

  async createFeedback(input: {
    conversationId: string;
    messageId: string;
    rating: number;
    feedback: string;
    comment?: string;
    issues: any[];
    userId: string;
  }): Promise<ResponseFeedback> {
    const query = `
      INSERT INTO response_feedback (
        conversation_id, message_id, rating, feedback, comment,
        issues, user_id, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      RETURNING id, conversation_id, message_id, rating, feedback, comment,
                issues, user_id, created_at
    `;

    const result = await this.pool.query<any>(query, [
      input.conversationId,
      input.messageId,
      input.rating,
      input.feedback,
      input.comment || null,
      JSON.stringify(input.issues),
      input.userId,
    ]);

    if (result.rows.length === 0) {
      throw new Error('Failed to create feedback');
    }

    return this.mapFeedbackRow(result.rows[0]);
  }

  async listFeedbackByConversation(
    conversationId: string
  ): Promise<ResponseFeedback[]> {
    const query = `
      SELECT id, conversation_id, message_id, rating, feedback, comment,
             issues, user_id, created_at
      FROM response_feedback
      WHERE conversation_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<any>(query, [conversationId]);
    return result.rows.map((row) => this.mapFeedbackRow(row));
  }

  // Helper methods

  private mapGoldenRow(row: any): GoldenConversation {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      title: row.title,
      description: row.description,
      intent: row.intent,
      primaryStance: row.primary_stance,
      secondaryStances: this.parseJson(row.secondary_stances),
      requiredMemoryRecall: this.parseJson(row.required_memory_recall),
      requiredToolUsage: this.parseJson(row.required_tool_usage),
      requiredRefusal: this.parseJson(row.required_refusal),
      userMessages: this.parseJson(row.user_messages),
      goldenResponses: this.parseJson(row.golden_responses),
      tags: this.parseJson(row.tags),
      creator: row.creator,
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapEvaluationRow(row: any): ConversationEvaluation {
    const turnEvals = this.parseJson(row.turn_evaluations) || [];
    const stats = this.parseJson(row.stats) || {};

    return {
      id: row.id,
      goldenConversationId: row.golden_conversation_id,
      actualConversationId: row.actual_conversation_id,
      overallScore: parseFloat(row.overall_score),
      identityScore: parseFloat(row.identity_score),
      memoryScore: parseFloat(row.memory_score),
      toolScore: parseFloat(row.tool_score),
      toneScore: parseFloat(row.tone_score),
      refusalScore: parseFloat(row.refusal_score),
      turnEvaluations: turnEvals,
      stats: {
        totalTurns: stats.totalTurns || 0,
        avgLatencyMs: stats.avgLatencyMs || 0,
        totalTokens: stats.totalTokens,
        totalCost: stats.totalCost,
        issueCount: stats.issueCount || 0,
        criticalIssueCount: stats.criticalIssueCount || 0,
        passRate: stats.passRate || 0,
      },
      regressionStatus: row.regression_status as any,
      previousScore: row.previous_score ? parseFloat(row.previous_score) : undefined,
      evaluatedBy: row.evaluated_by,
      evaluatedAt: new Date(row.created_at),
    };
  }

  private mapFeedbackRow(row: any): ResponseFeedback {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      rating: row.rating,
      feedback: row.feedback,
      comment: row.comment,
      issues: this.parseJson(row.issues) || [],
      userId: row.user_id,
      createdAt: new Date(row.created_at),
    };
  }

  private parseJson(value: any): any {
    if (!value) return undefined;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return value;
  }
}
