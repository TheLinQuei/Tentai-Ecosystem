/**
 * Phase 1 Stub Implementations
 * LLMGateway, PolicyEngine, and RunRecordStore for testing
 * These are replaced with real implementations in Phase 2+
 */

import { ThoughtState, Plan, RunRecord, Citation } from './types.js';
import {
  LLMGateway,
  PolicyEngine,
  PolicyViolation,
  RunRecordStore,
} from './interfaces.js';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { Intent } from './types.js';

/**
 * StubLLMGateway: deterministic Phase 1 implementation
 */
export class StubLLMGateway implements LLMGateway {
  async classifyIntent(input: string, _context?: Record<string, unknown>): Promise<Intent> {
    // Phase 1: simple heuristic intent classification
    let category: Intent['category'] = 'unknown';
    let reasoning = 'Default classification';
    
    if (input.toLowerCase().includes('?')) {
      category = 'query';
      reasoning = 'Input contains question mark';
    } else if (input.toLowerCase().includes('please') || input.toLowerCase().includes('can you')) {
      category = 'command';
      reasoning = 'Input contains polite request words';
    }

    return {
      category,
      confidence: 0.75,
      reasoning,
    };
  }

  async generatePlan(_intent: Intent, _context?: Record<string, unknown>): Promise<Plan> {
    // Simple deterministic plan for tests/dev; avoids LLM calls
    const plan: Plan = {
      steps: [
        {
          id: randomUUID(),
          type: 'respond',
          description: 'Generate stub response',
          params: { intent_category: _intent.category },
        },
      ],
      reasoning: 'Stub plan for deterministic responses',
      estimatedComplexity: 'simple',
      toolsNeeded: [],
      memoryAccessNeeded: _intent.requiresMemory || false,
    };

    return plan;
  }

  async generateResponse(thought: ThoughtState): Promise<string> {
    // Phase 1: deterministic response based on intent
    if (thought.intent?.category === 'query') {
      return `I understood your question: "${thought.input}". Here's my response based on the information I have.`;
    } else if (thought.intent?.category === 'command') {
      return `I'll help with that. Command executed: "${thought.input}".`;
    } else {
      return `I didn't fully understand. Could you clarify: "${thought.input}"?`;
    }
  }
}

/**
 * StubPolicyEngine: permissive Phase 1 implementation
 */
export class StubPolicyEngine implements PolicyEngine {
  async authorize(_action: string, _userId: string): Promise<boolean> {
    // Phase 1: allow all actions
    return true;
  }

  async check(_thought: ThoughtState): Promise<PolicyViolation[]> {
    // Phase 1: no violations
    return [];
  }

  async recordDecision(
    _policyId: string,
    _userId: string,
    _action: 'allow' | 'deny' | 'require_approval',
    _reason: string
  ): Promise<void> {
    // Phase 1: no-op
  }
}

/**
 * PostgresRunRecordStore: persist run records to DB
 * Schema: run_records table (created in migrations)
 */
export class PostgresRunRecordStore implements RunRecordStore {
  constructor(private pool: Pool) {}

  async save(record: RunRecord): Promise<string> {
    const recordId = randomUUID();
    const query = `
      INSERT INTO run_records (
        id, thought_state_id, user_id, session_id, timestamp,
        input_text, intent, plan_executed, execution_result, reflection, assistant_output,
        total_duration, success
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      RETURNING id
    `;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(query, [
        recordId,
        record.thoughtStateId,
        record.userId,
        record.sessionId,
        record.timestamp,
        record.inputText,
        JSON.stringify(record.intent),
        JSON.stringify(record.planExecuted),
        JSON.stringify(record.executionResult),
        JSON.stringify(record.reflection),
        record.assistantOutput ?? null,
        record.totalDuration,
        record.success,
      ]);

      if (record.citations && record.citations.length > 0) {
        await this.saveCitationsInternal(client, recordId, record.citations);
      }

      await client.query('COMMIT');
      return recordId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async saveCitations(runRecordId: string, citations: Citation[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.saveCitationsInternal(client, runRecordId, citations);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getCitationsByRunRecordId(runRecordId: string): Promise<Citation[]> {
    const result = await this.pool.query(
      `SELECT id, citation_type, source_id, source_text, confidence, metadata, source_timestamp
       FROM response_citations
       WHERE run_record_id = $1
       ORDER BY created_at ASC`,
      [runRecordId]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      type: row.citation_type,
      sourceId: row.source_id,
      sourceText: row.source_text ?? '',
      confidence: Number(row.confidence ?? 0),
      timestamp: row.source_timestamp ?? undefined,
      metadata: row.metadata ?? undefined,
    }));
  }

  async get(recordId: string): Promise<RunRecord | null> {
    const result = await this.pool.query(
      'SELECT * FROM run_records WHERE id = $1',
      [recordId]
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async listByUser(userId: string, limit?: number): Promise<RunRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM run_records WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [userId, limit || 100]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async listBySession(sessionId: string): Promise<RunRecord[]> {
    const result = await this.pool.query(
      'SELECT * FROM run_records WHERE session_id = $1 ORDER BY timestamp ASC',
      [sessionId]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  private async saveCitationsInternal(
    client: PoolClient,
    runRecordId: string,
    citations: Citation[]
  ): Promise<void> {
    if (!citations || citations.length === 0) return;

    for (const citation of citations) {
      const confidence = Math.min(1, Math.max(0, citation.confidence ?? 0));
      await client.query(
        `INSERT INTO response_citations (
          id, run_record_id, citation_type, source_id, source_text, confidence, metadata, source_timestamp
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        )
        ON CONFLICT (run_record_id, citation_type, source_id) DO NOTHING`,
        [
          citation.id || randomUUID(),
          runRecordId,
          citation.type,
          citation.sourceId,
          citation.sourceText,
          confidence,
          citation.metadata ?? null,
          citation.timestamp ?? null,
        ]
      );
    }
  }

  private mapRow(row: any): RunRecord {
    return {
      thoughtStateId: row.thought_state_id,
      userId: row.user_id,
      sessionId: row.session_id,
      timestamp: row.timestamp,
      inputText: row.input_text,
      intent: row.intent,
      planExecuted: row.plan_executed,
      executionResult: row.execution_result,
      reflection: row.reflection,
      assistantOutput: row.assistant_output ?? undefined,
      totalDuration: row.total_duration,
      success: row.success,
    };
  }
}
