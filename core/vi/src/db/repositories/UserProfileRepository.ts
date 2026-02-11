import { Pool } from 'pg';
import { UserProfile } from '../../brain/profile.js';

export class UserProfileRepository {
  constructor(private readonly pool: Pool) {}

  async getByUserId(userId: string): Promise<UserProfile | null> {
    const res = await this.pool.query(
      `SELECT profile, version, relationship_type, trust_level, interaction_mode, tone_preference, voice_profile, boundaries_profile
       FROM user_profiles WHERE user_id = $1`,
      [userId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    const profile = row.profile as UserProfile;
    return {
      ...profile,
      userId,
      // preserve version if stored
      version: typeof row.version === 'number' ? row.version : 1,
      relationship_type: row.relationship_type ?? profile?.relationship_type,
      trust_level: row.trust_level !== undefined && row.trust_level !== null ? Number(row.trust_level) : profile?.trust_level,
      interaction_mode: row.interaction_mode ?? profile?.interaction_mode,
      tone_preference: row.tone_preference ?? profile?.tone_preference,
      voice_profile: row.voice_profile ?? profile?.voice_profile,
      boundaries_profile: row.boundaries_profile ?? profile?.boundaries_profile,
    };
  }

  async upsert(profile: UserProfile): Promise<void> {
    const payload = { ...profile } as any;
    // Do not persist internal cache-only fields
    delete payload.userId;

    await this.pool.query(
      `INSERT INTO user_profiles (user_id, profile, version)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id)
       DO UPDATE SET profile = EXCLUDED.profile, version = EXCLUDED.version, updated_at = now()`,
      [profile.userId, payload, profile.version ?? 1]
    );
  }
}
