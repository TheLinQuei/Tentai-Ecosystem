-- Migration: Create user_relationships table
-- Phase 2: Relationship Model (Owner vs Public)
-- Date: 2026-02-04

-- Create ENUM types for relationship attributes
CREATE TYPE relationship_type AS ENUM ('owner', 'public');
CREATE TYPE tone_preference AS ENUM ('neutral', 'direct', 'warm', 'formal');
CREATE TYPE voice_profile AS ENUM ('public_elegant', 'owner_luxury');
CREATE TYPE interaction_mode AS ENUM ('default', 'guarded');

-- Create user_relationships table
CREATE TABLE user_relationships (
  vi_user_id UUID PRIMARY KEY REFERENCES user_identity_map(vi_user_id) ON DELETE CASCADE,
  relationship_type relationship_type NOT NULL DEFAULT 'public',
  trust_level SMALLINT NOT NULL DEFAULT 0 CHECK (trust_level BETWEEN 0 AND 100),
  tone_preference tone_preference NOT NULL DEFAULT 'neutral',
  voice_profile voice_profile NOT NULL DEFAULT 'public_elegant',
  interaction_mode interaction_mode NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_user_relationships_vi_user_id ON user_relationships(vi_user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_relationships_updated_at
  BEFORE UPDATE ON user_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_user_relationships_updated_at();

-- Comments for documentation
COMMENT ON TABLE user_relationships IS 'Stores relationship context for each user (owner vs public mode)';
COMMENT ON COLUMN user_relationships.relationship_type IS 'owner or public - determines behavioral posture';
COMMENT ON COLUMN user_relationships.trust_level IS 'Operational trust score 0-100, influences tone adaptation';
COMMENT ON COLUMN user_relationships.tone_preference IS 'User preference for response tone style';
COMMENT ON COLUMN user_relationships.voice_profile IS 'Determines phrase pool and presence style';
COMMENT ON COLUMN user_relationships.interaction_mode IS 'Guarded mode forces public_elegant regardless of relationship_type';
