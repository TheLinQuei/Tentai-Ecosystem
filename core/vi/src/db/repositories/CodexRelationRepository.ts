import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface CodexRelationRecord {
  id: string;
  subjectId: string;
  objectId: string;
  relationType: string;
  weight?: number | null;
  eraId?: string | null;
  truthAxis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  notes?: string | null;
  createdAt: string;
}

export interface CreateRelationInput {
  subjectId: string;
  objectId: string;
  relationType: string;
  weight?: number | null;
  eraId?: string | null;
  truthAxis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  notes?: string | null;
}

export class CodexRelationRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateRelationInput): Promise<CodexRelationRecord> {
    const id = randomUUID();
    const result = await this.pool.query<CodexRelationRecord>(
      `INSERT INTO codex_relations (id, subject_id, object_id, relation_type, weight, era_id, truth_axis, confidence, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id::text as id, subject_id::text as "subjectId", object_id::text as "objectId",
                 relation_type as "relationType", weight, era_id::text as "eraId",
                 truth_axis as "truthAxis", confidence, notes,
                 to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
      [
        id,
        input.subjectId,
        input.objectId,
        input.relationType,
        input.weight ?? null,
        input.eraId ?? null,
        input.truthAxis,
        input.confidence,
        input.notes ?? null,
      ]
    );
    return result.rows[0];
  }

  async listByEntity(entityId: string): Promise<CodexRelationRecord[]> {
    const result = await this.pool.query<CodexRelationRecord>(
      `SELECT id::text as id, subject_id::text as "subjectId", object_id::text as "objectId",
              relation_type as "relationType", weight, era_id::text as "eraId",
              truth_axis as "truthAxis", confidence, notes,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
       FROM codex_relations
       WHERE subject_id = $1 OR object_id = $1
       ORDER BY created_at DESC`,
      [entityId]
    );
    return result.rows;
  }
}
