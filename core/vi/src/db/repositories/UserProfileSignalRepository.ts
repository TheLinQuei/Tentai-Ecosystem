import { Pool } from 'pg';

export interface UserProfileSignalRecord {
  userId: string;
  signalType: string; // e.g., 'name', 'tonePreference', 'inferencePreference', 'relationalDepth', 'stanceBias'
  value: string;
  weight: number; // 0-1
  confidence: number; // 0-1
  firstObserved: string; // ISO timestamp
  lastObserved: string; // ISO timestamp
  observationCount: number;
  decayFactor: number; // 0-1 per day
}

export class UserProfileSignalRepository {
  constructor(private readonly pool: Pool) {}

  async getByUserId(userId: string): Promise<UserProfileSignalRecord[]> {
    const res = await this.pool.query(
      `SELECT user_id, signal_type, value, weight, confidence, first_observed, last_observed, observation_count, decay_factor
       FROM user_profile_signals
       WHERE user_id = $1`,
      [userId]
    );
    return res.rows.map(r => ({
      userId: r.user_id,
      signalType: r.signal_type,
      value: r.value,
      weight: Number(r.weight),
      confidence: Number(r.confidence),
      firstObserved: r.first_observed,
      lastObserved: r.last_observed,
      observationCount: Number(r.observation_count),
      decayFactor: Number(r.decay_factor),
    }));
  }

  async upsertSignal(record: UserProfileSignalRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_profile_signals (user_id, signal_type, value, weight, confidence, first_observed, last_observed, observation_count, decay_factor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, signal_type)
       DO UPDATE SET value = EXCLUDED.value,
                     weight = EXCLUDED.weight,
                     confidence = EXCLUDED.confidence,
                     last_observed = EXCLUDED.last_observed,
                     observation_count = EXCLUDED.observation_count,
                     decay_factor = EXCLUDED.decay_factor`,
      [
        record.userId,
        record.signalType,
        record.value,
        record.weight,
        record.confidence,
        record.firstObserved,
        record.lastObserved,
        record.observationCount,
        record.decayFactor,
      ]
    );
  }

  async getAll(): Promise<UserProfileSignalRecord[]> {
    const res = await this.pool.query(
      `SELECT user_id, signal_type, value, weight, confidence, first_observed, last_observed, observation_count, decay_factor
       FROM user_profile_signals`
    );
    return res.rows.map(r => ({
      userId: r.user_id,
      signalType: r.signal_type,
      value: r.value,
      weight: Number(r.weight),
      confidence: Number(r.confidence),
      firstObserved: r.first_observed,
      lastObserved: r.last_observed,
      observationCount: Number(r.observation_count),
      decayFactor: Number(r.decay_factor),
    }));
  }

  /**
   * Merge duplicate signals for a user by signal_type.
   * Keeps the value with highest (weight * confidence), sums observationCount, and averages decayFactor.
   */
  async mergeSimilarSignals(userId: string): Promise<number> {
    const res = await this.pool.query<any>(
      `SELECT signal_type, value, weight, confidence, observation_count, decay_factor
       FROM user_profile_signals WHERE user_id = $1`,
      [userId]
    );
    const grouped = new Map<string, any[]>();
    for (const r of res.rows) {
      const key = r.signal_type;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }
    let merges = 0;
    for (const [type, rows] of grouped.entries()) {
      if (rows.length <= 1) continue;
      // Choose best row by score
      rows.sort((a,b) => (Number(b.weight)*Number(b.confidence)) - (Number(a.weight)*Number(a.confidence)));
      const best = rows[0];
      const totalObs = rows.reduce((acc, r) => acc + Number(r.observation_count), 0);
      const avgDecay = rows.reduce((acc, r) => acc + Number(r.decay_factor), 0) / rows.length;
      // Upsert best as consolidated
      await this.upsertSignal({
        userId,
        signalType: type,
        value: String(best.value),
        weight: Number(best.weight),
        confidence: Number(best.confidence),
        firstObserved: new Date(0).toISOString(),
        lastObserved: new Date().toISOString(),
        observationCount: totalObs,
        decayFactor: avgDecay,
      });
      merges++;
    }
    return merges;
  }
}
