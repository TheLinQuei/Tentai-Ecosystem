import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface CodexEraRecord {
  id: string;
  slug: string;
  name: string;
  summary?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  createdAt: string;
}

export interface UpsertEraInput {
  id?: string;
  slug: string;
  name: string;
  summary?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export class CodexEraRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(input: UpsertEraInput): Promise<CodexEraRecord> {
    const id = input.id ?? randomUUID();
    const result = await this.pool.query<CodexEraRecord>(
      `INSERT INTO codex_eras (id, slug, name, summary, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           summary = EXCLUDED.summary,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at
       RETURNING id::text as id, slug, name, summary,
                 to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "startsAt",
                 to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "endsAt",
                 to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
      [id, input.slug, input.name, input.summary ?? null, input.startsAt ?? null, input.endsAt ?? null]
    );
    return result.rows[0];
  }

  async getBySlug(slug: string): Promise<CodexEraRecord | null> {
    const result = await this.pool.query<CodexEraRecord>(
      `SELECT id::text as id, slug, name, summary,
              to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "startsAt",
              to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "endsAt",
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
       FROM codex_eras
       WHERE slug = $1`,
      [slug]
    );
    return result.rows[0] ?? null;
  }

  async list(limit = 100, offset = 0): Promise<CodexEraRecord[]> {
    const result = await this.pool.query<CodexEraRecord>(
      `SELECT id::text as id, slug, name, summary,
              to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "startsAt",
              to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "endsAt",
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
       FROM codex_eras
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }
}
