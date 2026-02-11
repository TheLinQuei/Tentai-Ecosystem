-- Migration: Create overseer_audit_log table
-- Purpose: Store all Overseer control plane actions for persistent audit trail
-- Phase: 2 (Operations Hardening)

CREATE TABLE IF NOT EXISTS overseer_audit_log (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action VARCHAR(100) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  request_body JSONB,
  response_status INTEGER,
  response_body JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  duration_ms INTEGER,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast queries by timestamp
CREATE INDEX IF NOT EXISTS idx_overseer_audit_timestamp ON overseer_audit_log(timestamp DESC);

-- Index for queries by action
CREATE INDEX IF NOT EXISTS idx_overseer_audit_action ON overseer_audit_log(action);

-- Index for queries by user
CREATE INDEX IF NOT EXISTS idx_overseer_audit_user ON overseer_audit_log(user_id) WHERE user_id IS NOT NULL;

-- Retention policy: Auto-delete entries older than 90 days
-- (Run via scheduled job or manually)
COMMENT ON TABLE overseer_audit_log IS 'Persistent audit trail for Overseer control plane actions. Retention: 90 days.';
