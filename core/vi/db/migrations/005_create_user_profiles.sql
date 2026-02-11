-- Migration: Create user_profiles table
-- Purpose: Rich user profile for Vi to know each user deeply
-- Author: Vi Core Team
-- Date: 2026-01-01

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Core Identity
  bio TEXT,
  timezone VARCHAR(50),
  location VARCHAR(100),
  occupation VARCHAR(100),
  interests TEXT[], -- Array of interest strings
  
  -- Tier & Access Control
  tier VARCHAR(20) DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise', 'admin')),
  tier_features JSONB DEFAULT '{}', -- Tier-specific feature flags
  
  -- Communication Preferences
  communication_style VARCHAR(50), -- e.g., 'direct', 'conversational', 'technical'
  topics_of_interest TEXT[], -- Array of topics user frequently discusses
  boundaries JSONB DEFAULT '{}', -- User-defined boundaries/limits
  
  -- Metadata
  profile_completeness INTEGER DEFAULT 0 CHECK (profile_completeness >= 0 AND profile_completeness <= 100),
  user_metadata JSONB DEFAULT '{}', -- Flexible custom fields
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_interaction_at TIMESTAMP WITH TIME ZONE
);

-- Index for user_id lookups (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Index for tier-based queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_tier ON user_profiles(tier);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on profile changes
CREATE TRIGGER trigger_update_user_profile_timestamp
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION update_user_profile_timestamp();

-- Default tier features (can be customized per deployment)
-- Free tier: basic chat, limited history
-- Pro tier: unlimited history, advanced features, priority support
-- Enterprise tier: custom integrations, dedicated resources
-- Admin tier: full system access, user management
