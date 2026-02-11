import { Pool } from 'pg';
import { randomUUID } from 'crypto';

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export class MessageRepository {
  constructor(private readonly pool: Pool) {}

  async create(
    conversationId: string,
    role: MessageRecord['role'],
    content: string
  ): Promise<MessageRecord> {
    const id = randomUUID();
    const result = await this.pool.query<MessageRecord>(
      `INSERT INTO messages (id, conversation_id, role, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, conversation_id as "conversationId", role, content,
         to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`,
      [id, conversationId, role, content]
    );
    return result.rows[0];
  }

  async listByConversation(conversationId: string): Promise<MessageRecord[]> {
    const result = await this.pool.query<MessageRecord>(
      `SELECT id, conversation_id as "conversationId", role, content,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );
    return result.rows;
  }
}
