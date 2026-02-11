-- Migration: Create sessions table
-- Purpose: Store JWT refresh tokens and session metadata
-- Author: Vi Core Team
-- Date: 2025-12-23

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL UNIQUE,
  access_token_jti TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for user sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);

-- Index for active sessions (not expired, not revoked)
CREATE INDEX IF NOT EXISTS idx_sessions_active 
ON sessions(user_id, expires_at, revoked_at) 
WHERE revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP;

-- Index for cleanup (expired sessions)
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
