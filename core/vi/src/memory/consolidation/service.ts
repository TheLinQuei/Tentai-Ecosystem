import type { Pool } from 'pg';

export interface ConsolidationStats {
  userId: string;
  removedOldCount: number;
  removedDuplicatesCount: number;
  timestamp: Date;
}

export class MemoryConsolidationService {
  constructor(private pool: Pool) {}

  /**
   * Remove memories older than the provided number of days.
   */
  async pruneOld(userId: string, daysOld: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const result = await this.pool.query(
      `DELETE FROM memory_vectors WHERE user_id = $1 AND created_at < $2`,
      [userId, cutoff]
    );
    return result.rowCount ?? 0;
  }

  /**
   * Remove exact text duplicates (keep the most recent per text).
   */
  async dedupeExactText(userId: string): Promise<number> {
    // Find duplicate text ids for this user, keeping the newest per text
    const duplicates = await this.pool.query<{ id: string }>(
      `WITH ranked AS (
         SELECT id, text,
                ROW_NUMBER() OVER (PARTITION BY text ORDER BY created_at DESC) AS rn
         FROM memory_vectors
         WHERE user_id = $1
       )
       SELECT id FROM ranked WHERE rn > 1`,
      [userId]
    );

    const ids = duplicates.rows.map((r) => r.id);
    if (ids.length === 0) return 0;

    const del = await this.pool.query(
      `DELETE FROM memory_vectors WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return del.rowCount ?? 0;
  }

  /**
   * Run full consolidation: dedupe exact text and prune old items.
   */
  async run(userId: string, daysOld: number = 30): Promise<ConsolidationStats> {
    const removedDuplicatesCount = await this.dedupeExactText(userId);
    const removedOldCount = await this.pruneOld(userId, daysOld);

    return {
      userId,
      removedOldCount,
      removedDuplicatesCount,
      timestamp: new Date(),
    };
  }
}
