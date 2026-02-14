import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: '127.0.0.1',
  port: 5433,
  database: 'vibot',
  user: 'vibot',
  password: 'vibot',
  ssl: false
});

console.log('Attempting connection...');
try {
  await client.connect();
  console.log('✓ Connected successfully!');
  const res = await client.query('SELECT version()');
  console.log('Version:', res.rows[0].version);
  await client.end();
} catch (err) {
  console.error('✗ Connection failed:', err.message);
  console.error('Error code:', err.code);
  process.exit(1);
}
