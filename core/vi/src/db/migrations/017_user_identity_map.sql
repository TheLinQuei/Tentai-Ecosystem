-- Phase 1: User Identity Map
-- Purpose: Global identity mapping across all clients
-- Constraint: ONE user → ONE vi_user_id, enforced via UNIQUE(provider, provider_user_id)

CREATE TABLE IF NOT EXISTS user_identity_map (
  vi_user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_user_id)
);

-- Index for fast lookup by provider identity
CREATE INDEX IF NOT EXISTS idx_user_identity_map_provider_id 
ON user_identity_map(provider, provider_user_id);

-- Index for finding all providers linked to vi_user_id
CREATE INDEX IF NOT EXISTS idx_user_identity_map_vi_user_id 
ON user_identity_map(vi_user_id);

-- Trigger to update updated_at
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
