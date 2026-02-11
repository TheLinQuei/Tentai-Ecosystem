-- Phase 3: Cross-Session Personality Persistence
-- Stores user tone preferences, interaction mode, and relationship settings
-- Survives session boundaries - loaded automatically on session start

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vi_user_id UUID NOT NULL UNIQUE REFERENCES user_profiles(vi_user_id) ON DELETE CASCADE,
  
  -- Tone Corrections (learned from user feedback)
  tone_preference TEXT, -- 'direct' | 'elegant' | 'playful' | 'warm' | NULL
  tone_correction_count INT DEFAULT 0, -- How many times user corrected tone
  
  -- Interaction Mode (user's preferred interaction style)
  interaction_mode TEXT DEFAULT 'assistant', -- 'assistant' | 'companion' | 'operator' | 'lorekeeper'
  interaction_mode_locked BOOLEAN DEFAULT FALSE, -- Explicit lock if user demanded specific mode
  
  -- Relationship Cues (explicit flags learned from behavior)
  relationship_cue_owner BOOLEAN DEFAULT FALSE, -- Has user indicated they're the owner?
  relationship_cue_trusted BOOLEAN DEFAULT FALSE, -- Trusted indicator
  relationship_cue_restricted BOOLEAN DEFAULT FALSE, -- Restricted/professional mode
  
  -- Response Preferences (learned from corrections)
  prefer_concise BOOLEAN DEFAULT FALSE, -- User said "be more concise"
  prefer_detailed BOOLEAN DEFAULT FALSE, -- User said "more detail please"
  no_apologies BOOLEAN DEFAULT FALSE, -- User corrected: don't apologize
  no_disclaimers BOOLEAN DEFAULT FALSE, -- User corrected: skip AI disclaimers
  
  -- Lore Mode Preference
  default_lore_mode BOOLEAN DEFAULT FALSE, -- User prefers verse/lore context by default
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_applied_session_id UUID, -- Last session where prefs were applied
  correction_history JSONB DEFAULT '[]', -- [{timestamp, type, detail}, ...]
  
  -- Timestamps for audit
  last_tone_correction_at TIMESTAMPTZ,
  last_mode_change_at TIMESTAMPTZ,
  last_relationship_cue_at TIMESTAMPTZ
);

-- Index for fast preference loading by user
CREATE INDEX IF NOT EXISTS idx_user_preferences_vi_user_id ON user_preferences(vi_user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_updated_at ON user_preferences(updated_at DESC);

-- Audit table: track all preference changes
CREATE TABLE IF NOT EXISTS preference_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vi_user_id UUID NOT NULL REFERENCES user_profiles(vi_user_id) ON DELETE CASCADE,
  change_type TEXT NOT NULL, -- 'tone_correction' | 'mode_change' | 'relationship_cue' | 'preference_toggle'
  old_value JSONB,
  new_value JSONB,
  reason TEXT, -- Why the change happened (user feedback, system detected, etc.)
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_preference_audit_vi_user_id ON preference_audit_log(vi_user_id);
CREATE INDEX IF NOT EXISTS idx_preference_audit_created_at ON preference_audit_log(created_at DESC);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON user_preferences TO vi_service;
GRANT SELECT, INSERT ON preference_audit_log TO vi_service;
