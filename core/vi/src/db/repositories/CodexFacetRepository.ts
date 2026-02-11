import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface CodexFacetRecord {
  id: string;
  entityId: string;
  key: string;
  value: unknown;
  truthAxis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  createdAt: string;
  updatedAt: string;
}

export interface UpsertFacetInput {
  id?: string;
  entityId: string;
  key: string;
  value: unknown;
  truthAxis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
}

export class CodexFacetRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(input: UpsertFacetInput): Promise<CodexFacetRecord> {
    const id = input.id ?? randomUUID();
    const result = await this.pool.query<CodexFacetRecord>(
      `INSERT INTO codex_facets (id, entity_id, key, value, truth_axis, confidence)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET value = EXCLUDED.value,
           truth_axis = EXCLUDED.truth_axis,
           confidence = EXCLUDED.confidence,
           updated_at = NOW()
       RETURNING id::text as id, entity_id::text as "entityId", key, value,
                 truth_axis as "truthAxis", confidence,
                 to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
                 to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"`,
      [id, input.entityId, input.key, JSON.stringify(input.value), input.truthAxis, input.confidence]
    );
    return result.rows[0];
  }

  async listByEntity(entityId: string): Promise<CodexFacetRecord[]> {
    const result = await this.pool.query<CodexFacetRecord>(
      `SELECT id::text as id, entity_id::text as "entityId", key, value,
              truth_axis as "truthAxis", confidence,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
       FROM codex_facets
       WHERE entity_id = $1
       ORDER BY created_at DESC`,
      [entityId]
    );
    return result.rows;
  }
}
