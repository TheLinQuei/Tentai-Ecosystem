import { Pool } from 'pg';

export type FactAuthority = 'locked' | 'explicit' | 'inferred' | 'ephemeral';
export type FactScope = 'global' | 'project' | 'session';
export type FactType = 'rule' | 'preference' | 'context' | 'history';
export type FactSource = 'user' | 'system' | 'correction';

export interface UserFact {
  fact_id: string;
  vi_user_id: string;
  fact_key: string;
  fact_type: FactType;
  authority: FactAuthority;
  scope: FactScope;
  value: Record<string, unknown>;
  confidence: number;
  source: FactSource;
  created_at: Date;
  updated_at: Date;
  expires_at?: Date | null;
}

const AUTHORITY_ORDER: FactAuthority[] = ['locked', 'explicit', 'inferred', 'ephemeral'];

export class UserFactRepository {
  constructor(private pool: Pool) {}

  async listByUser(viUserId: string): Promise<UserFact[]> {
    const res = await this.pool.query(
      `SELECT fact_id, vi_user_id, fact_key, fact_type, authority, scope, value, confidence, source, created_at, updated_at, expires_at
       FROM user_facts
       WHERE vi_user_id = $1
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY updated_at DESC`,
      [viUserId]
    );
    return res.rows.map((row) => this.mapRow(row));
  }

  async listLockedFacts(viUserId: string): Promise<UserFact[]> {
    const res = await this.pool.query(
      `SELECT fact_id, vi_user_id, fact_key, fact_type, authority, scope, value, confidence, source, created_at, updated_at, expires_at
       FROM user_facts
       WHERE vi_user_id = $1
         AND authority = 'locked'
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY updated_at DESC`,
      [viUserId]
    );
    return res.rows.map((row) => this.mapRow(row));
  }

  async listFactsOrdered(viUserId: string): Promise<UserFact[]> {
    const res = await this.pool.query(
      `SELECT fact_id, vi_user_id, fact_key, fact_type, authority, scope, value, confidence, source, created_at, updated_at, expires_at
       FROM user_facts
       WHERE vi_user_id = $1
         AND (expires_at IS NULL OR expires_at > now())
       ORDER BY
         CASE authority
           WHEN 'locked' THEN 1
           WHEN 'explicit' THEN 2
           WHEN 'inferred' THEN 3
           WHEN 'ephemeral' THEN 4
           ELSE 5
         END,
         updated_at DESC`,
      [viUserId]
    );
    return res.rows.map((row) => this.mapRow(row));
  }

  async upsertFact(fact: Omit<UserFact, 'fact_id' | 'created_at' | 'updated_at'>): Promise<UserFact> {
    const existing = await this.pool.query(
      `SELECT fact_id, authority
       FROM user_facts
       WHERE vi_user_id = $1 AND fact_key = $2 AND scope = $3
       LIMIT 1`,
      [fact.vi_user_id, fact.fact_key, fact.scope]
    );

    const existingRow = existing.rows[0];
    if (existingRow?.authority === 'locked' && fact.authority !== 'locked') {
      throw new Error('Locked fact cannot be overridden without explicit user instruction');
    }

    const res = await this.pool.query(
      `INSERT INTO user_facts
         (vi_user_id, fact_key, fact_type, authority, scope, value, confidence, source, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (vi_user_id, fact_key, scope)
       DO UPDATE SET
         fact_type = EXCLUDED.fact_type,
         authority = EXCLUDED.authority,
         value = EXCLUDED.value,
         confidence = EXCLUDED.confidence,
         source = EXCLUDED.source,
         updated_at = now(),
         expires_at = EXCLUDED.expires_at
       RETURNING fact_id, vi_user_id, fact_key, fact_type, authority, scope, value, confidence, source, created_at, updated_at, expires_at`,
      [
        fact.vi_user_id,
        fact.fact_key,
        fact.fact_type,
        fact.authority,
        fact.scope,
        fact.value,
        fact.confidence,
        fact.source,
        fact.expires_at ?? null,
      ]
    );

    return this.mapRow(res.rows[0]);
  }

  async revokeFact(viUserId: string, factKey: string, scope: FactScope): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_facts WHERE vi_user_id = $1 AND fact_key = $2 AND scope = $3`,
      [viUserId, factKey, scope]
    );
  }

  private mapRow(row: any): UserFact {
    return {
      fact_id: row.fact_id,
      vi_user_id: row.vi_user_id,
      fact_key: row.fact_key,
      fact_type: row.fact_type,
      authority: row.authority,
      scope: row.scope,
      value: row.value,
      confidence: typeof row.confidence === 'number' ? row.confidence : 1.0,
      source: row.source,
      created_at: row.created_at,
      updated_at: row.updated_at,
      expires_at: row.expires_at,
    } as UserFact;
  }
}

export const authorityOrder = (authority: FactAuthority): number => {
  const idx = AUTHORITY_ORDER.indexOf(authority);
  return idx >= 0 ? idx : AUTHORITY_ORDER.length;
};
