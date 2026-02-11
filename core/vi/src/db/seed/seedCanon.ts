/**
 * Seed Sample Canon Data
 * Run: node dist/db/seed/seedCanon.js
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seedCanon() {
  try {
    console.log('[Seed] Starting canon data seed...');

    // Sample entities
    const entities = [
      { slug: 'movado', name: 'Movado', type: 'Character', aliases: '["The Adversary", "Time Breaker"]', summary: 'Primary antagonist. Master of temporal manipulation.', truth_axis: 'truth', confidence: 'locked' },
      { slug: 'azula', name: 'Azula', type: 'Character', aliases: '["The Sovereign", "Timeline Guardian"]', summary: 'Sovereign of the Astralis verse. Guardian of the Timeline.', truth_axis: 'truth', confidence: 'locked' },
      { slug: 'akima', name: 'Akima', type: 'Character', aliases: '["Bridge-walker", "Reality Shifter"]', summary: 'Bridge-walker. Moves between realities.', truth_axis: 'truth', confidence: 'locked' },
      { slug: 'astralis', name: 'Astralis', type: 'World', aliases: '["The Verse", "Pocket Dimension"]', summary: 'A pocket dimension holding multiple timelines.', truth_axis: 'truth', confidence: 'locked' },
      { slug: 'codex', name: 'The Codex', type: 'Item', aliases: '["Astralis Codex", "Living Record"]', summary: 'The living record of Astralis canon. Repository of all verified lore.', truth_axis: 'truth', confidence: 'locked' },
    ];

    for (const entity of entities) {
      await pool.query(
        `INSERT INTO codex_entities (slug, name, type, aliases, summary, truth_axis, confidence, citations)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, '[]'::jsonb)
         ON CONFLICT (slug) DO NOTHING`,
        [entity.slug, entity.name, entity.type, entity.aliases, entity.summary, entity.truth_axis, entity.confidence]
      );
      console.log(`[Seed] Inserted entity: ${entity.name}`);
    }

    // Get entity IDs
    const movadoId = (await pool.query(`SELECT id FROM codex_entities WHERE slug = 'movado'`)).rows[0]?.id;
    const azulaId = (await pool.query(`SELECT id FROM codex_entities WHERE slug = 'azula'`)).rows[0]?.id;
    const akimaId = (await pool.query(`SELECT id FROM codex_entities WHERE slug = 'akima'`)).rows[0]?.id;
    const astralisId = (await pool.query(`SELECT id FROM codex_entities WHERE slug = 'astralis'`)).rows[0]?.id;
    const codexId = (await pool.query(`SELECT id FROM codex_entities WHERE slug = 'codex'`)).rows[0]?.id;

    // Sample facts
    if (movadoId) {
      await pool.query(
        `INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT DO NOTHING`,
        [movadoId, 'origin', '"Outside Astralis, invaded during Timeline Fracture"', 'truth', 'locked']
      );
      await pool.query(
        `INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT DO NOTHING`,
        [movadoId, 'primary_goal', '"Temporal domination and timeline collapse"', 'truth', 'locked']
      );
      console.log(`[Seed] Added facts for Movado`);
    }

    if (azulaId) {
      await pool.query(
        `INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT DO NOTHING`,
        [azulaId, 'role', '"Timeline Guardian and Sovereign of Astralis"', 'truth', 'locked']
      );
      console.log(`[Seed] Added facts for Azula`);
    }

    if (akimaId) {
      await pool.query(
        `INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT DO NOTHING`,
        [akimaId, 'ability', '"Moves between realities, maintains bridges between timelines"', 'truth', 'locked']
      );
      console.log(`[Seed] Added facts for Akima`);
    }

    if (astralisId) {
      await pool.query(
        `INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT DO NOTHING`,
        [astralisId, 'dimension_type', '"Pocket dimension separate from baseline reality"', 'truth', 'locked']
      );
      console.log(`[Seed] Added facts for Astralis`);
    }

    if (codexId) {
      await pool.query(
        `INSERT INTO codex_facets (entity_id, key, value, truth_axis, confidence)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT DO NOTHING`,
        [codexId, 'authority', '"Absolute canon authority - all lore must align with Codex"', 'truth', 'locked']
      );
      console.log(`[Seed] Added facts for Codex`);
    }

    console.log('[Seed] Canon data seeded successfully!');
  } catch (error) {
    console.error('[Seed] Error seeding canon data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedCanon();
