-- Astralis Codex additive tables (v1)
-- Rule: additive-only; no breaking changes to existing core tables

CREATE TABLE IF NOT EXISTS codex_eras (
  id UUID PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  summary TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS codex_entities (
  id UUID PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS codex_facets (
  id UUID PRIMARY KEY,
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
  id UUID PRIMARY KEY,
  entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  data JSONB NOT NULL,
  era_id UUID NULL REFERENCES codex_eras(id) ON DELETE SET NULL,
  truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
  confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_states_entity ON codex_states(entity_id);
CREATE INDEX IF NOT EXISTS idx_codex_states_entity_key ON codex_states(entity_id, key);

CREATE TABLE IF NOT EXISTS codex_relations (
  id UUID PRIMARY KEY,
  subject_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  weight NUMERIC CHECK (weight >= 0 AND weight <= 1),
  era_id UUID NULL REFERENCES codex_eras(id) ON DELETE SET NULL,
  truth_axis TEXT NOT NULL CHECK (truth_axis IN ('truth','belief','public')),
  confidence TEXT NOT NULL CHECK (confidence IN ('locked','provisional','experimental')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_relations_subject ON codex_relations(subject_id);
CREATE INDEX IF NOT EXISTS idx_codex_relations_object ON codex_relations(object_id);

CREATE TABLE IF NOT EXISTS codex_events (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,
  primary_entity_id UUID NULL REFERENCES codex_entities(id) ON DELETE SET NULL,
  era_id UUID NULL REFERENCES codex_eras(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_events_era ON codex_events(era_id);
CREATE INDEX IF NOT EXISTS idx_codex_events_primary_entity ON codex_events(primary_entity_id);

CREATE TABLE IF NOT EXISTS codex_event_entities (
  event_id UUID NOT NULL REFERENCES codex_events(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES codex_entities(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, entity_id)
);

CREATE TABLE IF NOT EXISTS codex_changes (
  id UUID PRIMARY KEY,
  change_type TEXT NOT NULL CHECK (change_type IN ('add','update','delete','deprecate')),
  entity_id UUID NULL REFERENCES codex_entities(id) ON DELETE SET NULL,
  proposer_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','proposed','approved','rejected')),
  approvals JSONB NOT NULL DEFAULT '[]',
  applied_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codex_changes_status ON codex_changes(status);
CREATE INDEX IF NOT EXISTS idx_codex_changes_entity ON codex_changes(entity_id);
