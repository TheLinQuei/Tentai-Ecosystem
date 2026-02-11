import { Pool } from 'pg';
import { Citation } from '../../brain/grounding/types.js';

export class CitationRepository {
  constructor(private readonly pool: Pool) {}

  async listByRunRecordId(runRecordId: string): Promise<Citation[]> {
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
      metadata: row.metadata ?? undefined,
      timestamp: row.source_timestamp ?? undefined,
    }));
  }
}
