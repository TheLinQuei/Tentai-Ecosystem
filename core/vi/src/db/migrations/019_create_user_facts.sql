CREATE TABLE IF NOT EXISTS user_facts (
  fact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vi_user_id UUID NOT NULL REFERENCES user_identity_map(vi_user_id),
  fact_key TEXT NOT NULL,
  fact_type TEXT NOT NULL,         -- rule | preference | context | history
  authority TEXT NOT NULL,         -- locked | explicit | inferred | ephemeral
  scope TEXT NOT NULL,             -- global | project | session
  value JSONB NOT NULL,
  confidence FLOAT DEFAULT 1.0,
  source TEXT NOT NULL,            -- user | system | correction
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  UNIQUE (vi_user_id, fact_key, scope)
);

CREATE INDEX IF NOT EXISTS idx_user_facts_user_id ON user_facts(vi_user_id);
CREATE INDEX IF NOT EXISTS idx_user_facts_authority ON user_facts(authority);
CREATE INDEX IF NOT EXISTS idx_user_facts_scope ON user_facts(scope);
CREATE INDEX IF NOT EXISTS idx_user_facts_updated_at ON user_facts(updated_at);
