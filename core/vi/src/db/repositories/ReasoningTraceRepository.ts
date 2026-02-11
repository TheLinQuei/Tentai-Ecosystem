/**
 * Reasoning Trace Repository
 * Stores and retrieves detailed reasoning traces for transparency
 */

import { Pool } from 'pg';

export interface ReasoningTrace {
  trace_id: string;
  record_id: string;
  user_id: string;
  timestamp: Date;
  intent_category: string;
  intent_reasoning: string;
  intent_confidence: number;
  memory_facts_used: Array<{
    fact_id: string;
    authority_level: string;
    content: string;
  }>;
  tools_called: Array<{
    tool_name: string;
    params: Record<string, unknown>;
    result: unknown;
  }>;
  governor_checks: Array<{
    check_type: string;
    passed: boolean;
    reason?: string;
  }>;
  decision: string;
  memory_written: boolean;
  had_violation: boolean;
  mode: string;
}

export interface ReasoningTraceSummary {
  trace_id: string;
  record_id: string;
  timestamp: Date;
  intent_category: string;
  decision: string;
  had_violation: boolean;
}

export class ReasoningTraceRepository {
  constructor(private pool: Pool) {}

  async store(trace: Omit<ReasoningTrace, 'trace_id' | 'timestamp'>): Promise<string> {
    const query = `
      INSERT INTO reasoning_traces (
        record_id, user_id, intent_category, intent_reasoning, intent_confidence,
        memory_facts_used, tools_called, governor_checks, decision,
        memory_written, had_violation, mode
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING trace_id
    `;

    const result = await this.pool.query(query, [
      trace.record_id,
      trace.user_id,
      trace.intent_category,
      trace.intent_reasoning,
      trace.intent_confidence,
      JSON.stringify(trace.memory_facts_used),
      JSON.stringify(trace.tools_called),
      JSON.stringify(trace.governor_checks),
      trace.decision,
      trace.memory_written,
      trace.had_violation,
      trace.mode,
    ]);

    return result.rows[0].trace_id;
  }

  async getByRecordId(recordId: string): Promise<ReasoningTrace | null> {
    const query = `
      SELECT 
        trace_id, record_id, user_id, created_at as timestamp,
        intent_category, intent_reasoning, intent_confidence,
        memory_facts_used, tools_called, governor_checks,
        decision, memory_written, had_violation, mode
      FROM reasoning_traces
      WHERE record_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.pool.query(query, [recordId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      trace_id: row.trace_id,
      record_id: row.record_id,
      user_id: row.user_id,
      timestamp: row.timestamp,
      intent_category: row.intent_category,
      intent_reasoning: row.intent_reasoning,
      intent_confidence: row.intent_confidence,
      memory_facts_used: row.memory_facts_used,
      tools_called: row.tools_called,
      governor_checks: row.governor_checks,
      decision: row.decision,
      memory_written: row.memory_written,
      had_violation: row.had_violation,
      mode: row.mode,
    };
  }

  async getByUserId(userId: string, limit: number = 50): Promise<ReasoningTraceSummary[]> {
    const query = `
      SELECT 
        trace_id, record_id, created_at as timestamp,
        intent_category, decision, had_violation
      FROM reasoning_traces
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [userId, limit]);
    return result.rows.map(row => ({
      trace_id: row.trace_id,
      record_id: row.record_id,
      timestamp: row.timestamp,
      intent_category: row.intent_category,
      decision: row.decision,
      had_violation: row.had_violation,
    }));
  }

  async queryAudit(params: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    hadViolation?: boolean;
    limit?: number;
  }): Promise<ReasoningTraceSummary[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramCount = 0;

    if (params.userId) {
      paramCount++;
      conditions.push(`user_id = $${paramCount}`);
      values.push(params.userId);
    }

    if (params.startDate) {
      paramCount++;
      conditions.push(`created_at >= $${paramCount}`);
      values.push(params.startDate);
    }

    if (params.endDate) {
      paramCount++;
      conditions.push(`created_at <= $${paramCount}`);
      values.push(params.endDate);
    }

    if (params.hadViolation !== undefined) {
      paramCount++;
      conditions.push(`had_violation = $${paramCount}`);
      values.push(params.hadViolation);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 100;

    const query = `
      SELECT trace_id, record_id, created_at as timestamp,
             intent_category, decision, had_violation
      FROM reasoning_traces
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount + 1}
    `;

    values.push(limit);

    const result = await this.pool.query(query, values);
    return result.rows.map(row => ({
      trace_id: row.trace_id,
      record_id: row.record_id,
      timestamp: row.timestamp,
      intent_category: row.intent_category,
      decision: row.decision,
      had_violation: row.had_violation,
    }));
  }
}
