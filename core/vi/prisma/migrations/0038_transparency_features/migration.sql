-- Migration 0038: Transparency Features
-- Adds tables for reasoning traces, safety profiles, and loyalty contracts

-- Reasoning Traces Table
CREATE TABLE IF NOT EXISTS reasoning_traces (
  trace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Intent Analysis
  intent_category TEXT NOT NULL,
  intent_reasoning TEXT,
  intent_confidence DECIMAL(3, 2),
  
  -- Context Used
  memory_facts_used JSONB DEFAULT '[]'::jsonb,
  tools_called JSONB DEFAULT '[]'::jsonb,
  governor_checks JSONB DEFAULT '[]'::jsonb,
  
  -- Decision
  decision TEXT NOT NULL,
  memory_written BOOLEAN DEFAULT false,
  had_violation BOOLEAN DEFAULT false,
  mode TEXT,
  
  -- Indexes for queries
  CONSTRAINT reasoning_traces_record_id_fkey FOREIGN KEY (record_id) REFERENCES run_records(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reasoning_traces_user_id ON reasoning_traces(user_id);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_record_id ON reasoning_traces(record_id);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_created_at ON reasoning_traces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reasoning_traces_had_violation ON reasoning_traces(had_violation) WHERE had_violation = true;

-- Safety Profiles Table
CREATE TABLE IF NOT EXISTS safety_profiles (
  profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Safety Settings
  safety_level TEXT NOT NULL DEFAULT 'balanced', -- 'maximum' | 'balanced' | 'minimal'
  context_sensitivity BOOLEAN DEFAULT true,
  refusal_explanation TEXT DEFAULT 'detailed', -- 'detailed' | 'brief'
  appeal_process BOOLEAN DEFAULT true,
  
  -- Custom Rules (JSONB for flexibility)
  custom_rules JSONB DEFAULT '[]'::jsonb,
  
  CONSTRAINT safety_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_safety_profiles_user_id ON safety_profiles(user_id);

-- Loyalty Contracts Table
CREATE TABLE IF NOT EXISTS loyalty_contracts (
  contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Contract Terms
  primary_goals JSONB DEFAULT '[]'::jsonb, -- User's primary goals
  boundaries JSONB DEFAULT '[]'::jsonb, -- Forbidden actions
  override_conditions JSONB DEFAULT '[]'::jsonb, -- Emergency overrides
  verification_frequency TEXT DEFAULT 'monthly', -- 'weekly' | 'monthly' | 'quarterly'
  
  -- Metadata
  last_verified_at TIMESTAMPTZ,
  
  CONSTRAINT loyalty_contracts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loyalty_contracts_user_id ON loyalty_contracts(user_id);

-- Delegation Contracts Table (for optional autonomy mode)
CREATE TABLE IF NOT EXISTS delegation_contracts (
  delegation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  
  -- Task Definition
  task TEXT NOT NULL,
  trigger TEXT NOT NULL, -- 'Every 6 hours' | 'When new entity added'
  authority_level TEXT NOT NULL DEFAULT 'notify_only', -- 'notify_only' | 'suggest_fix' | 'auto_fix_with_log'
  
  -- Execution Log
  last_executed_at TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  
  -- Revocable
  revocable BOOLEAN DEFAULT true,
  
  CONSTRAINT delegation_contracts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delegation_contracts_user_id ON delegation_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_delegation_contracts_active ON delegation_contracts(user_id, expires_at) WHERE revoked_at IS NULL;

-- Memory Audit Query View (convenience for memory audit UI)
CREATE OR REPLACE VIEW memory_audit_view AS
SELECT 
  mdr.id,
  mdr.user_id,
  mdr.created_at,
  mdr.content,
  mdr.type as memory_type,
  mdr.metadata->>'authority' as authority_level,
  mdr.metadata->>'source' as source,
  mdr.metadata->>'confidence' as confidence,
  COALESCE((mdr.metadata->>'locked')::boolean, false) as is_locked
FROM multidimensional_memory_records mdr
ORDER BY mdr.created_at DESC;
