/**
 * BondRepository: Persistence layer for BondModel.
 * Tracks relational state between Vi and users.
 */

import { Pool } from 'pg';
import { BondModel, BondAuditEntry, defaultBond, applyBondDecay } from '../../brain/bond.js';

export class BondRepository {
  constructor(private readonly pool: Pool) {}

  async getByUserId(userId: string): Promise<BondModel | null> {
    const res = await this.pool.query(
      `SELECT user_id, trust, familiarity, rapport, commitments_made, commitments_kept,
              interaction_count, first_interaction, last_interaction, decay_factor,
              updated_at, version
       FROM bonds
       WHERE user_id = $1`,
      [userId]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    const bond: BondModel = {
      userId: row.user_id,
      trust: Number(row.trust),
      familiarity: Number(row.familiarity),
      rapport: Number(row.rapport),
      commitmentsMade: Number(row.commitments_made),
      commitmentsKept: Number(row.commitments_kept),
      interactionCount: Number(row.interaction_count),
      firstInteraction: row.first_interaction,
      lastInteraction: row.last_interaction,
      decayFactor: Number(row.decay_factor),
      updatedAt: row.updated_at,
      version: Number(row.version),
    };

    // Apply decay before returning
    return applyBondDecay(bond);
  }

  async upsert(bond: BondModel): Promise<void> {
    await this.pool.query(
      `INSERT INTO bonds (user_id, trust, familiarity, rapport, commitments_made, commitments_kept,
                          interaction_count, first_interaction, last_interaction, decay_factor,
                          updated_at, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id)
       DO UPDATE SET trust = EXCLUDED.trust,
                     familiarity = EXCLUDED.familiarity,
                     rapport = EXCLUDED.rapport,
                     commitments_made = EXCLUDED.commitments_made,
                     commitments_kept = EXCLUDED.commitments_kept,
                     interaction_count = EXCLUDED.interaction_count,
                     last_interaction = EXCLUDED.last_interaction,
                     decay_factor = EXCLUDED.decay_factor,
                     updated_at = EXCLUDED.updated_at,
                     version = EXCLUDED.version`,
      [
        bond.userId,
        bond.trust,
        bond.familiarity,
        bond.rapport,
        bond.commitmentsMade,
        bond.commitmentsKept,
        bond.interactionCount,
        bond.firstInteraction,
        bond.lastInteraction,
        bond.decayFactor,
        bond.updatedAt,
        bond.version,
      ]
    );
  }

  async logAudit(entry: BondAuditEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO bond_audit_log (user_id, timestamp, changes, trust, familiarity, rapport, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.userId,
        entry.timestamp,
        entry.changes,
        entry.trust,
        entry.familiarity,
        entry.rapport,
        entry.version,
      ]
    );
  }

  async getAll(): Promise<BondModel[]> {
    const res = await this.pool.query(
      `SELECT user_id, trust, familiarity, rapport, commitments_made, commitments_kept,
              interaction_count, first_interaction, last_interaction, decay_factor,
              updated_at, version
       FROM bonds
       ORDER BY last_interaction DESC`
    );

    return res.rows.map(row => ({
      userId: row.user_id,
      trust: Number(row.trust),
      familiarity: Number(row.familiarity),
      rapport: Number(row.rapport),
      commitmentsMade: Number(row.commitments_made),
      commitmentsKept: Number(row.commitments_kept),
      interactionCount: Number(row.interaction_count),
      firstInteraction: row.first_interaction,
      lastInteraction: row.last_interaction,
      decayFactor: Number(row.decay_factor),
      updatedAt: row.updated_at,
      version: Number(row.version),
    }));
  }

  /**
   * Load or create bond for user.
   */
  async loadOrCreate(userId: string): Promise<BondModel> {
    const existing = await this.getByUserId(userId);
    if (existing) return existing;

    const bond = defaultBond(userId);
    await this.upsert(bond);
    return bond;
  }
}
