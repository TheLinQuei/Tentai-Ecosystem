import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/vi'
});

// Create identity_audit_log table
await pool.query(`
  CREATE TABLE IF NOT EXISTS identity_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vi_user_id UUID NOT NULL,
    action TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    performed_by TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_identity_audit_log_user ON identity_audit_log(vi_user_id);
  CREATE INDEX IF NOT EXISTS idx_identity_audit_log_action ON identity_audit_log(action);
  CREATE INDEX IF NOT EXISTS idx_identity_audit_log_created_at ON identity_audit_log(created_at DESC);
`);

console.log('Created identity_audit_log table');
await pool.end();
