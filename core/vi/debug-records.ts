import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  user: 'vi_user',
  password: 'tentai_vi_2024',
  database: 'vi_db',
});

(async () => {
  try {
    const result = await pool.query(`
      SELECT session_id, user_id, input_text, assistant_output, timestamp 
      FROM run_records 
      ORDER BY timestamp DESC 
      LIMIT 15
    `);

    console.log(`\n=== LAST 15 RECORDS ===\n`);
    result.rows.forEach((row, i) => {
      console.log(`[${i + 1}] SESSION: ${String(row.session_id).substring(0, 8)}...`);
      console.log(`    USER:    "${row.input_text}"`);
      console.log(`    ASST:    ${row.assistant_output ? `"${row.assistant_output.substring(0, 80)}..."` : 'NULL'}`);
      console.log(`    TIME:    ${row.timestamp}\n`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
  }
})();
