import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface CodexStateRecord {
  id: string;
  entityId: string;
  key: string;
  data: unknown;
  eraId?: string | null;
  truthAxis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  createdAt: string;
}

export interface CreateStateInput {
  entityId: string;
  key: string;
  data: unknown;
  eraId?: string | null;
  truthAxis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
}

export class CodexStateRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateStateInput): Promise<CodexStateRecord> {
    const id = randomUUID();
    const result = await this.pool.query<CodexStateRecord>(
      `INSERT INTO codex_states (id, entity_id, key, data, era_id, truth_axis, confidence)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       RETURNING id::text as id, entity_id::text as "entityId", key, data,
                 era_id::text as "eraId", truth_axis as "truthAxis", confidence,
                 to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
      [id, input.entityId, input.key, JSON.stringify(input.data), input.eraId ?? null, input.truthAxis, input.confidence]
    );
    return result.rows[0];
  }

  async listByEntity(entityId: string): Promise<CodexStateRecord[]> {
    const result = await this.pool.query<CodexStateRecord>(
      `SELECT id::text as id, entity_id::text as "entityId", key, data,
              era_id::text as "eraId", truth_axis as "truthAxis", confidence,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
       FROM codex_states
       WHERE entity_id = $1
       ORDER BY created_at DESC`,
      [entityId]
    );
    return result.rows;
  }
}
