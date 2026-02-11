-- Astralis Codex additive tables (v1)
-- Rule: additive-only; no breaking changes to existing core tables

CREATE TABLE IF NOT EXISTS codex_eras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  summary TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS codex_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'Character','World','Ability','Item','Law','Rule','Event','Era','Organization','Species'
  )),
  aliases JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
  confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
  era_id UUID NULL REFERENCES codex_eras(id) ON DELETE SET NULL,
  citations JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_entities_slug ON codex_entities(slug);
CREATE INDEX IF NOT EXISTS idx_codex_entities_type ON codex_entities(type);

CREATE TABLE IF NOT EXISTS codex_facets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
  confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_facets_entity ON codex_facets(entity_id);
CREATE INDEX IF NOT EXISTS idx_codex_facets_entity_key ON codex_facets(entity_id, key);

CREATE TABLE IF NOT EXISTS codex_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
  confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_states_entity ON codex_states(entity_id);
CREATE INDEX IF NOT EXISTS idx_codex_states_valid ON codex_states(entity_id, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS codex_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  to_entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
  confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_relationships_from ON codex_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_codex_relationships_to ON codex_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_codex_relationships_type ON codex_relationships(relationship_type);

CREATE TABLE IF NOT EXISTS codex_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('primary','secondary','inference')),
  reference TEXT NOT NULL,
  excerpt TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_sources_entity ON codex_sources(entity_id);

-- Audit trail for canon changes
CREATE TABLE IF NOT EXISTS codex_audit_log (
  id SERIAL PRIMARY KEY,
  entity_id UUID REFERENCES codex_entities(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  changed_by TEXT,
  changes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_audit_entity ON codex_audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_codex_audit_timestamp ON codex_audit_log(created_at DESC);
