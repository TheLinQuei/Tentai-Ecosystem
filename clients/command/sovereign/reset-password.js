// Quick password reset script
// Usage: node reset-password.js <email> <new-password>

import bcrypt from 'bcrypt';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'vi',
});

const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('Usage: node reset-password.js <email> <new-password>');
  process.exit(1);
}

async function resetPassword() {
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING email, username',
      [hash, email]
    );

    if (result.rows.length === 0) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    console.log(`✓ Password updated for ${result.rows[0].email} (${result.rows[0].username})`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

resetPassword();
