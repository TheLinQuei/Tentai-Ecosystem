import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { getRequestContext } from '../requestContext.js';

export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
export const SYSTEM_SESSION_ID = '00000000-0000-0000-0000-000000000000';

export interface EventRecord {
  id: string;
  timestamp: Date;
  userId: string; // Now required (auto-filled if missing)
  sessionId: string; // Now required (auto-filled if missing)
  layer: number; // 1-10
  type: string;  // e.g., intent_classified, stance_decision, memory_retrieved
  level: 'debug' | 'info' | 'warn' | 'error';
  message?: string;
  data?: Record<string, unknown>;
}

export class ObservabilityRepository {
  constructor(private pool: Pool) {}

  private listeners: Set<(event: EventRecord) => void> = new Set();

  subscribe(listener: (event: EventRecord) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: EventRecord): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[Observability] listener failed', err);
      }
    }
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        user_id UUID,
        session_id UUID,
        layer INT NOT NULL,
        type TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT,
        data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_layer ON events(layer);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    `);
  }

  async emit(event: Omit<EventRecord, 'id' | 'timestamp'> & { timestamp?: Date }): Promise<string> {
    const id = randomUUID();
    const ts = event.timestamp || new Date();
    
    // Auto-fill userId/sessionId from request context if missing
    let userId = event.userId;
    let sessionId = event.sessionId;
    
    if (!userId || !sessionId) {
      const ctx = getRequestContext();
      if (ctx) {
        userId = userId || ctx.userId;
        sessionId = sessionId || ctx.sessionId;
      }
    }
    
    // Fallback to system if still missing
    if (!userId) userId = SYSTEM_USER_ID;
    if (!sessionId) sessionId = SYSTEM_SESSION_ID;

    const record: EventRecord = {
      id,
      timestamp: ts,
      userId,
      sessionId,
      layer: event.layer,
      type: event.type,
      level: event.level,
      message: event.message,
      data: event.data,
    };

    await this.pool.query(
      `INSERT INTO events (id, timestamp, user_id, session_id, layer, type, level, message, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
      [id, ts, userId, sessionId, event.layer, event.type, event.level, event.message || null, event.data ? JSON.stringify(event.data) : null]
    );

    this.notify(record);
    return id;
  }

  async listRecent(
    limit: number = 200,
    userId?: string,
    sessionId?: string,
    offset: number = 0
  ): Promise<{ events: EventRecord[]; total: number }> {
    let query = `SELECT id, timestamp, user_id, session_id, layer, type, level, message, data FROM events WHERE 1=1`;
    const params: any[] = [];

    if (userId) {
      query += ` AND user_id = $${params.length + 1}`;
      params.push(userId);
    }

    if (sessionId) {
      query += ` AND session_id = $${params.length + 1}`;
      params.push(sessionId);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const res = await this.pool.query<any>(query, params);
    
    // Count total matching records
    let countQuery = `SELECT COUNT(*) as total FROM events WHERE 1=1`;
    const countParams: any[] = [];
    
    if (userId) {
      countQuery += ` AND user_id = $${countParams.length + 1}`;
      countParams.push(userId);
    }
    
    if (sessionId) {
      countQuery += ` AND session_id = $${countParams.length + 1}`;
      countParams.push(sessionId);
    }

    const countRes = await this.pool.query<any>(countQuery, countParams);
    const total = parseInt(countRes.rows[0]?.total || '0');

    const events = res.rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      userId: r.user_id,
      sessionId: r.session_id,
      layer: r.layer,
      type: r.type,
      level: r.level,
      message: r.message || undefined,
      data: r.data || undefined,
    }));

    return { events, total };
  }
}
