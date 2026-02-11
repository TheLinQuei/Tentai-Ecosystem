import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface SessionArc {
  id: string;
  userId: string;
  sessionId: string;
  title?: string;
  mood: 'neutral' | 'positive' | 'negative' | 'mixed';
  summary: string;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionArcRepository {
  constructor(private pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS session_arcs (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        session_id UUID NOT NULL,
        title TEXT,
        mood TEXT NOT NULL,
        summary TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_session_arcs_user ON session_arcs(user_id);
      CREATE INDEX IF NOT EXISTS idx_session_arcs_session ON session_arcs(session_id);
    `);
  }

  async upsertArc(arc: Omit<SessionArc, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
    const id = arc.id || randomUUID();
    await this.pool.query(
      `INSERT INTO session_arcs (id, user_id, session_id, title, mood, summary, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, mood = EXCLUDED.mood, summary = EXCLUDED.summary, updated_at = now()`,
      [id, arc.userId, arc.sessionId, arc.title || null, arc.mood, arc.summary]
    );
    return id;
  }

  async getLatestForUser(userId: string, limit: number = 3): Promise<SessionArc[]> {
    const res = await this.pool.query<any>(
      `SELECT id, user_id, session_id, title, mood, summary, created_at, updated_at
       FROM session_arcs WHERE user_id = $1 ORDER BY updated_at DESC LIMIT $2`,
      [userId, limit]
    );
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      sessionId: r.session_id,
      title: r.title || undefined,
      mood: (r.mood as any),
      summary: r.summary,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
}
