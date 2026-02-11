-- Migration: Add Relationship Model (Phase 2)
-- Purpose: Enable Vi to behave differently based on user relationship type
-- Adds: relationship_type, trust_level, interaction_mode, tone_preference, voice_profile
-- Author: Vi Architecture
-- Date: 2026-01-10

-- Add columns to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS relationship_type TEXT DEFAULT 'normal'
  CHECK (relationship_type IN ('owner', 'trusted', 'normal', 'restricted')),
ADD COLUMN IF NOT EXISTS trust_level INTEGER DEFAULT 0
  CHECK (trust_level >= 0 AND trust_level <= 100),
ADD COLUMN IF NOT EXISTS interaction_mode TEXT DEFAULT 'assistant'
  CHECK (interaction_mode IN ('assistant', 'companion', 'operator', 'lorekeeper')),
ADD COLUMN IF NOT EXISTS tone_preference TEXT DEFAULT 'neutral'
  CHECK (tone_preference IN ('direct', 'elegant', 'playful', 'warm', 'neutral')),
ADD COLUMN IF NOT EXISTS voice_profile TEXT DEFAULT 'LUXE_ORIGIN';

-- Create index for relationship-based queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_relationship_type
ON user_profiles(relationship_type);

-- Create index for trust-level filtering (e.g., high-trust operations)
CREATE INDEX IF NOT EXISTS idx_user_profiles_trust_level
ON user_profiles(trust_level);

-- Create composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_user_profiles_relationship_trust
ON user_profiles(relationship_type, trust_level);

-- Add trigger to track relationship changes
CREATE OR REPLACE FUNCTION log_relationship_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.relationship_type IS DISTINCT FROM OLD.relationship_type
     OR NEW.trust_level IS DISTINCT FROM OLD.trust_level
     OR NEW.interaction_mode IS DISTINCT FROM OLD.interaction_mode
  THEN
    NEW.updated_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_relationship_change ON user_profiles;
CREATE TRIGGER trigger_relationship_change
AFTER UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION log_relationship_change();
