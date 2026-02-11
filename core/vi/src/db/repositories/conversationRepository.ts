import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface ConversationRecord {
  id: string;
  title: string;
  userId?: string;
  createdAt: string;
}

export class ConversationRepository {
  constructor(private readonly pool: Pool) {}

  async create(title: string, userId?: string): Promise<ConversationRecord> {
    const id = randomUUID();
    const result = await this.pool.query<ConversationRecord>(
      `INSERT INTO conversations (id, title, user_id)
       VALUES ($1, $2, $3::uuid)
       RETURNING id, title, user_id::text as "userId", to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
      [id, title, userId ?? null]
    );
    return result.rows[0];
  }

  async getById(id: string): Promise<ConversationRecord | null> {
    const result = await this.pool.query<ConversationRecord>(
      `SELECT id, title, user_id::text as "userId", to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
       FROM conversations
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }
}
