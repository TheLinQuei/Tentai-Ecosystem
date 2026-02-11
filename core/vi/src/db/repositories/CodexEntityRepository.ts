import type { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface CodexEntityRecord {
  id: string;
  slug: string;
  name: string;
  type: string;
  aliases: string[];
  summary?: string | null;
  truthAxis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  eraId?: string | null;
  citations: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertEntityInput {
  id?: string;
  slug: string;
  name: string;
  type: string;
  aliases?: string[];
  summary?: string | null;
  truthAxis: 'truth' | 'belief' | 'public';
  confidence: 'locked' | 'provisional' | 'experimental';
  eraId?: string | null;
  citations?: unknown[];
}

export class CodexEntityRepository {
  constructor(private readonly pool: Pool) {}

  async upsert(input: UpsertEntityInput): Promise<CodexEntityRecord> {
    const id = input.id ?? randomUUID();
    const result = await this.pool.query<CodexEntityRecord>(
      `INSERT INTO codex_entities (id, slug, name, type, aliases, summary, truth_axis, confidence, era_id, citations)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb)
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           type = EXCLUDED.type,
           aliases = EXCLUDED.aliases,
           summary = EXCLUDED.summary,
           truth_axis = EXCLUDED.truth_axis,
           confidence = EXCLUDED.confidence,
           era_id = EXCLUDED.era_id,
           citations = EXCLUDED.citations,
           updated_at = NOW()
       RETURNING id::text as id, slug, name, type, aliases,
                 summary, truth_axis as "truthAxis", confidence, era_id::text as "eraId",
                 citations, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
                 to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"`,
      [
        id,
        input.slug,
        input.name,
        input.type,
        JSON.stringify(input.aliases ?? []),
        input.summary ?? null,
        input.truthAxis,
        input.confidence,
        input.eraId ?? null,
        JSON.stringify(input.citations ?? []),
      ]
    );
    return result.rows[0];
  }

  async getById(id: string): Promise<CodexEntityRecord | null> {
    const result = await this.pool.query<CodexEntityRecord>(
      `SELECT id::text as id, slug, name, type, aliases,
              summary, truth_axis as "truthAxis", confidence, era_id::text as "eraId",
              citations, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
       FROM codex_entities
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async getBySlug(slug: string): Promise<CodexEntityRecord | null> {
    const result = await this.pool.query<CodexEntityRecord>(
      `SELECT id::text as id, slug, name, type, aliases,
              summary, truth_axis as "truthAxis", confidence, era_id::text as "eraId",
              citations, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
       FROM codex_entities
       WHERE slug = $1`,
      [slug]
    );
    return result.rows[0] ?? null;
  }

  async search(term: string, limit = 20): Promise<CodexEntityRecord[]> {
    const result = await this.pool.query<CodexEntityRecord>(
      `SELECT id::text as id, slug, name, type, aliases,
              summary, truth_axis as "truthAxis", confidence, era_id::text as "eraId",
              citations, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
       FROM codex_entities
       WHERE slug ILIKE $1 OR name ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [`%${term}%`, limit]
    );
    return result.rows;
  }
}
