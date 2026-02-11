import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface CodexEventRecord {
  id: string;
  type: string;
  primaryEntityId?: string | null;
  eraId?: string | null;
  timestamp: string;
  summary: string;
  details?: unknown;
  createdAt: string;
  entityIds: string[];
}

export interface CreateEventInput {
  type: string;
  primaryEntityId?: string | null;
  entityIds?: string[];
  eraId?: string | null;
  timestamp: string;
  summary: string;
  details?: unknown;
}

export class CodexEventRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateEventInput): Promise<CodexEventRecord> {
    const id = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const eventResult = await client.query<CodexEventRecord>(
        `INSERT INTO codex_events (id, type, primary_entity_id, era_id, timestamp, summary, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id::text as id, type, primary_entity_id::text as "primaryEntityId",
                   era_id::text as "eraId", to_char(timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "timestamp",
                   summary, details,
                   to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
        [
          id,
          input.type,
          input.primaryEntityId ?? null,
          input.eraId ?? null,
          input.timestamp,
          input.summary,
          input.details ?? null,
        ]
      );

      const entityIds = input.entityIds ?? [];
      if (entityIds.length > 0) {
        const values: unknown[] = [];
        const rows = entityIds
          .map((entityId, idx) => {
            const base = idx * 2;
            values.push(id, entityId);
            return `($${base + 1}, $${base + 2})`;
          })
          .join(',');
        await client.query(`INSERT INTO codex_event_entities (event_id, entity_id) VALUES ${rows}`, values);
      }

      await client.query('COMMIT');
      return { ...eventResult.rows[0], entityIds };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
