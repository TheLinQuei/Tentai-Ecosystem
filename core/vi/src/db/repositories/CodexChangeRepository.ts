import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface CodexChangeRecord {
  id: string;
  changeType: 'add' | 'update' | 'delete' | 'deprecate';
  entityId?: string | null;
  proposerUserId?: string | null;
  status: 'draft' | 'proposed' | 'approved' | 'rejected';
  approvals: unknown[];
  appliedAt?: string | null;
  createdAt: string;
}

export interface CreateChangeInput {
  changeType: 'add' | 'update' | 'delete' | 'deprecate';
  entityId?: string | null;
  proposerUserId?: string | null;
  status?: 'draft' | 'proposed' | 'approved' | 'rejected';
  approvals?: unknown[];
  appliedAt?: string | null;
}

export class CodexChangeRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateChangeInput): Promise<CodexChangeRecord> {
    const id = randomUUID();
    const result = await this.pool.query<CodexChangeRecord>(
      `INSERT INTO codex_changes (id, change_type, entity_id, proposer_user_id, status, approvals, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id::text as id, change_type as "changeType", entity_id::text as "entityId",
                 proposer_user_id::text as "proposerUserId", status, approvals,
                 to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "appliedAt",
                 to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
      [
        id,
        input.changeType,
        input.entityId ?? null,
        input.proposerUserId ?? null,
        input.status ?? 'draft',
        JSON.stringify(input.approvals ?? []),
        input.appliedAt ?? null,
      ]
    );
    return result.rows[0];
  }

  async listByEntity(entityId: string): Promise<CodexChangeRecord[]> {
    const result = await this.pool.query<CodexChangeRecord>(
      `SELECT id::text as id, change_type as "changeType", entity_id::text as "entityId",
              proposer_user_id::text as "proposerUserId", status, approvals,
              to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "appliedAt",
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
       FROM codex_changes
       WHERE entity_id = $1
       ORDER BY created_at DESC`,
      [entityId]
    );
    return result.rows;
  }
}
