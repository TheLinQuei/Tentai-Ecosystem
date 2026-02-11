-- Phase 2: Relationship Model (Owner vs Public)
-- Purpose: Extend user_profiles with relationship fields used by RelationshipResolver

ALTER TABLE IF EXISTS user_profiles
  ADD COLUMN IF NOT EXISTS relationship_type TEXT DEFAULT 'normal', -- owner | trusted | normal | restricted
  ADD COLUMN IF NOT EXISTS trust_level INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interaction_mode TEXT DEFAULT 'assistant', -- assistant | companion | operator | lorekeeper
  ADD COLUMN IF NOT EXISTS tone_preference TEXT, -- direct | elegant | playful | warm | neutral
  ADD COLUMN IF NOT EXISTS voice_profile TEXT DEFAULT 'LUXE_ORIGIN';
