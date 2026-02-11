/**
 * Loyalty Contract Repository
 * Manages explicit user-AI alignment contracts
 */

import { Pool } from 'pg';

export interface LoyaltyContract {
  contract_id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
  primary_goals: string[];
  boundaries: string[];
  override_conditions: string[];
  verification_frequency: 'weekly' | 'monthly' | 'quarterly';
  last_verified_at: Date | null;
}

export class LoyaltyContractRepository {
  constructor(private pool: Pool) {}

  async getByUserId(userId: string): Promise<LoyaltyContract | null> {
    const query = `
      SELECT contract_id, user_id, created_at, updated_at,
             primary_goals, boundaries, override_conditions,
             verification_frequency, last_verified_at
      FROM loyalty_contracts
      WHERE user_id = $1
    `;

    const result = await this.pool.query(query, [userId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      contract_id: row.contract_id,
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      primary_goals: row.primary_goals || [],
      boundaries: row.boundaries || [],
      override_conditions: row.override_conditions || [],
      verification_frequency: row.verification_frequency,
      last_verified_at: row.last_verified_at,
    };
  }

  async createOrUpdate(userId: string, contract: {
    primary_goals?: string[];
    boundaries?: string[];
    override_conditions?: string[];
    verification_frequency?: 'weekly' | 'monthly' | 'quarterly';
  }): Promise<LoyaltyContract> {
    const query = `
      INSERT INTO loyalty_contracts (
        user_id, primary_goals, boundaries, override_conditions,
        verification_frequency
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) DO UPDATE SET
        primary_goals = COALESCE($2, loyalty_contracts.primary_goals),
        boundaries = COALESCE($3, loyalty_contracts.boundaries),
        override_conditions = COALESCE($4, loyalty_contracts.override_conditions),
        verification_frequency = COALESCE($5, loyalty_contracts.verification_frequency),
        updated_at = now()
      RETURNING contract_id, user_id, created_at, updated_at,
                primary_goals, boundaries, override_conditions,
                verification_frequency, last_verified_at
    `;

    const result = await this.pool.query(query, [
      userId,
      contract.primary_goals ? JSON.stringify(contract.primary_goals) : null,
      contract.boundaries ? JSON.stringify(contract.boundaries) : null,
      contract.override_conditions ? JSON.stringify(contract.override_conditions) : null,
      contract.verification_frequency || null,
    ]);

    const row = result.rows[0];
    return {
      contract_id: row.contract_id,
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      primary_goals: row.primary_goals || [],
      boundaries: row.boundaries || [],
      override_conditions: row.override_conditions || [],
      verification_frequency: row.verification_frequency,
      last_verified_at: row.last_verified_at,
    };
  }

  async verify(userId: string): Promise<void> {
    const query = `
      UPDATE loyalty_contracts
      SET last_verified_at = now()
      WHERE user_id = $1
    `;

    await this.pool.query(query, [userId]);
  }

  async delete(userId: string): Promise<boolean> {
    const query = `DELETE FROM loyalty_contracts WHERE user_id = $1`;
    const result = await this.pool.query(query, [userId]);
    return result.rowCount > 0;
  }
}
