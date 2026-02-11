-- Migration: Fix user_identity_map primary key to allow multiple providers per vi_user_id
-- Phase 1: Identity Spine bug fix
-- Date: 2026-02-06
-- Issue: Current PRIMARY KEY(vi_user_id) prevents multiple provider mappings per user
-- Solution: Change to PRIMARY KEY(provider, provider_user_id), add index on vi_user_id

-- Step 1: Create new table with correct schema
CREATE TABLE user_identity_map_new (
  vi_user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_user_id)
);

-- Step 2: Copy existing data
INSERT INTO user_identity_map_new (vi_user_id, provider, provider_user_id, metadata, created_at, updated_at)
SELECT vi_user_id, provider, provider_user_id, metadata, created_at, updated_at
FROM user_identity_map;

-- Step 3: Drop foreign key constraints from dependent tables
ALTER TABLE user_relationships DROP CONSTRAINT IF EXISTS user_relationships_vi_user_id_fkey;
ALTER TABLE user_facts DROP CONSTRAINT IF EXISTS user_facts_vi_user_id_fkey;

-- Step 4: Drop old table
DROP TABLE user_identity_map CASCADE;

-- Step 5: Rename new table
ALTER TABLE user_identity_map_new RENAME TO user_identity_map;

-- Step 6: Create indexes for fast lookups
CREATE INDEX idx_user_identity_map_vi_user_id ON user_identity_map(vi_user_id);
CREATE INDEX idx_user_identity_map_provider_id ON user_identity_map(provider, provider_user_id);

-- Step 7: Recreate trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_identity_map_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_identity_map_updated_at ON user_identity_map;
CREATE TRIGGER trigger_user_identity_map_updated_at
BEFORE UPDATE ON user_identity_map
FOR EACH ROW
EXECUTE FUNCTION update_user_identity_map_updated_at();

-- Step 8: Recreate audit log table if it doesn't exist
CREATE TABLE IF NOT EXISTS identity_audit_log (
  id SERIAL PRIMARY KEY,
  vi_user_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'link', 'unlink', 'migrate'
  provider TEXT NOT NULL,
  provider_user_id TEXT,
  metadata JSONB DEFAULT '{}',
  performed_by TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_audit_log_vi_user_id ON identity_audit_log(vi_user_id);
CREATE INDEX IF NOT EXISTS idx_identity_audit_log_created_at ON identity_audit_log(created_at);

-- Comments for documentation
COMMENT ON TABLE user_identity_map IS 'Maps provider identities to canonical vi_user_id. Multiple providers can map to same user.';
COMMENT ON COLUMN user_identity_map.vi_user_id IS 'Canonical user ID - source of truth across all clients';
COMMENT ON COLUMN user_identity_map.provider IS 'Identity provider (discord, sovereign, astralis, console, guest)';
COMMENT ON COLUMN user_identity_map.provider_user_id IS 'Provider-specific user ID';
