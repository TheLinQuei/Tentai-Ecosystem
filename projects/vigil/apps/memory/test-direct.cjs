const { Client } = require('pg');

async function test() {
  const client = new Client({
    host: 'localhost',
    port: 5434,
    user: 'vibot',
    password: 'vibot',
    database: 'vibot',
    ssl: false
  });
  
  try {
    console.log('Connecting to localhost:5434...');
    await client.connect();
    console.log('✅ Connected!');
    
    const res = await client.query('SELECT version()');
    console.log('✅ Query succeeded:', res.rows[0].version.substring(0, 50));
    
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Code:', err.code);
    process.exit(1);
  }
}

test();
