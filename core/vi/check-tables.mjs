import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/vi'
});

const result = await pool.query(`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('user_identity_map', 'identity_audit_log')
  ORDER BY table_name
`);

console.log('Identity tables:', result.rows);
await pool.end();
