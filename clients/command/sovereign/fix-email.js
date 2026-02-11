const {Pool} = require('pg');
const pool = new Pool({connectionString: 'postgresql://postgres:postgres@localhost:5432/vi'});

(async () => {
  await pool.query("UPDATE users SET email = LOWER(email) WHERE email LIKE 'Shykem%'");
  const r = await pool.query("SELECT id, email, username FROM users WHERE username='shykem'");
  console.log('Updated:', r.rows);
  await pool.end();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
