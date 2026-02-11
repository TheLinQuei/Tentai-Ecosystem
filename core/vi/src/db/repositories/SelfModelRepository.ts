import { Pool } from 'pg';
import { SelfModel } from '../../config/selfModel.js';

export interface SelfModelEvent {
  version: string;
  eventType: string;
  details?: Record<string, unknown>;
}

export interface SelfModelVersionInfo {
  version: string;
  isActive: boolean;
  createdAt: string;
  model: SelfModel;
}

export class SelfModelRepository {
  constructor(private readonly pool: Pool) {}

  async getActive(): Promise<SelfModel | null> {
    const res = await this.pool.query(
      'SELECT model FROM self_models WHERE is_active = true LIMIT 1'
    );
    if (res.rows.length === 0) return null;
    return res.rows[0].model as SelfModel;
  }

  async upsert(model: SelfModel): Promise<void> {
    await this.pool.query(
      `INSERT INTO self_models (version, model, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (version)
       DO UPDATE SET model = EXCLUDED.model, is_active = true`,
      [model.version, model]
    );

    // Ensure only one active version
    await this.pool.query(
      `UPDATE self_models SET is_active = false WHERE version <> $1`,
      [model.version]
    );
  }

  async logEvent(event: SelfModelEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO self_model_events (version, event_type, details)
       VALUES ($1, $2, $3)`,
      [event.version, event.eventType, event.details ?? {}]
    );
  }

  async listAll(): Promise<SelfModelVersionInfo[]> {
    const res = await this.pool.query(
      'SELECT version, model, is_active, created_at FROM self_models ORDER BY created_at DESC'
    );
    return res.rows.map(r => ({
      version: r.version,
      isActive: r.is_active,
      createdAt: r.created_at,
      model: r.model as SelfModel,
    }));
  }

  async listEvents(limit: number = 100): Promise<Array<SelfModelEvent & { createdAt: string }>> {
    const res = await this.pool.query(
      'SELECT version, event_type, details, created_at FROM self_model_events ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return res.rows.map(r => ({
      version: r.version,
      eventType: r.event_type,
      details: r.details ?? {},
      createdAt: r.created_at,
    }));
  }
}
