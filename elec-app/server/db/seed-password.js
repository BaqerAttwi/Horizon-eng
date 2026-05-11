/**
 * Run this ONCE after setting up the database to create the owner account:
 *   node server/db/seed-password.js
 *
 * It sets the owner password to whatever you pass as argument:
 *   node server/db/seed-password.js mypassword123
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db     = require('../db/connection');

async function run() {
  const password = process.argv[2] || 'admin123';
  const hash = await bcrypt.hash(password, 10);
  await db.execute(
    "UPDATE workers SET email='admin@company.com', password_hash=? WHERE id=1",
    [hash]
  );
  console.log(`✅ Owner password set to: "${password}"`);
  console.log('   Email: admin@company.com');
  console.log('   Login at: http://localhost:5173/login');
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
