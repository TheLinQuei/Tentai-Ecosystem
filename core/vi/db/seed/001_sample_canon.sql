-- Seed Sample Canon Data for Testing
-- Phase 4: Astralis Canon Integration

-- Sample Entities
INSERT INTO codex_entities (slug, name, type, aliases, summary, truth_axis, confidence) VALUES
('movado', 'Movado', 'Character', '["The Adversary", "Time Breaker"]', 'Primary antagonist. Master of temporal manipulation.', 'truth', 'locked'),
('azula', 'Azula', 'Character', '["The Sovereign", "Timeline Guardian"]', 'Sovereign of the Astralis verse. Guardian of the Timeline.', 'truth', 'locked'),
('akima', 'Akima', 'Character', '["Bridge-walker", "Reality Shifter"]', 'Bridge-walker. Moves between realities.', 'truth', 'locked'),
('astralis', 'Astralis', 'World', '["The Verse", "Pocket Dimension"]', 'A pocket dimension holding multiple timelines.', 'truth', 'locked'),
('codex', 'The Codex', 'Item', '["Astralis Codex", "Living Record"]', 'The living record of Astralis canon. Repository of all verified lore.', 'truth', 'locked')
ON CONFLICT (slug) DO NOTHING;

-- Sample Facts (using slugs to find entity_id)
INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
SELECT id, 'origin', '"Outside Astralis, invaded during Timeline Fracture"', 'truth', 'locked'
FROM codex_entities WHERE slug = 'movado'
ON CONFLICT DO NOTHING;

INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
SELECT id, 'primary_goal', '"Temporal domination and timeline collapse"', 'truth', 'locked'
FROM codex_entities WHERE slug = 'movado'
ON CONFLICT DO NOTHING;

INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
SELECT id, 'role', '"Timeline Guardian and Sovereign of Astralis"', 'truth', 'locked'
FROM codex_entities WHERE slug = 'azula'
ON CONFLICT DO NOTHING;

INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
SELECT id, 'age', '"Immortal - predates current timeline"', 'truth', 'provisional'
FROM codex_entities WHERE slug = 'azula'
ON CONFLICT DO NOTHING;

INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
SELECT id, 'ability', '"Moves between realities, maintains bridges between timelines"', 'truth', 'locked'
FROM codex_entities WHERE slug = 'akima'
ON CONFLICT DO NOTHING;

INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
SELECT id, 'dimension_type', '"Pocket dimension separate from baseline reality"', 'truth', 'locked'
FROM codex_entities WHERE slug = 'astralis'
ON CONFLICT DO NOTHING;

INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
SELECT id, 'timeline_count', '"Multiple contested timelines, number unstable"', 'truth', 'provisional'
FROM codex_entities WHERE slug = 'astralis'
ON CONFLICT DO NOTHING;

INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
SELECT id, 'authority', '"Absolute canon authority - all lore must align with Codex"', 'truth', 'locked'
FROM codex_entities WHERE slug = 'codex'
ON CONFLICT DO NOTHING;

-- Sample Sources
INSERT INTO codex_sources (entity_id, source_type, reference, excerpt, confidence)
SELECT id, 'primary', 'Astralis Codex Entry: Movado', 'The Adversary emerged from outside our verse during the Timeline Fracture event...', 'locked'
FROM codex_entities WHERE slug = 'movado'
ON CONFLICT DO NOTHING;

INSERT INTO codex_sources (entity_id, source_type, reference, excerpt, confidence)
SELECT id, 'primary', 'Astralis Codex Entry: Azula', 'As Sovereign, Azula bears the responsibility of maintaining timeline coherence...', 'locked'
FROM codex_entities WHERE slug = 'azula'
ON CONFLICT DO NOTHING;

-- Sample Relationships
INSERT INTO codex_relationships (from_entity_id, to_entity_id, relationship_type, properties, truth_axis, confidence)
SELECT 
  (SELECT id FROM codex_entities WHERE slug = 'azula'),
  (SELECT id FROM codex_entities WHERE slug = 'movado'),
  'opposes',
  '{"nature": "antagonistic", "ongoing": true}',
  'truth',
  'locked'
ON CONFLICT DO NOTHING;

INSERT INTO codex_relationships (from_entity_id, to_entity_id, relationship_type, properties, truth_axis, confidence)
SELECT 
  (SELECT id FROM codex_entities WHERE slug = 'akima'),
  (SELECT id FROM codex_entities WHERE slug = 'azula'),
  'allies_with',
  '{"nature": "cooperative", "role": "bridge_maintenance"}',
  'truth',
  'provisional'
ON CONFLICT DO NOTHING;
