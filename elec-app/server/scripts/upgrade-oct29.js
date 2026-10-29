// Run from server/ after backing up the database and stopping application writes.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const { ensureProjectItemSnapshots } = require('../utils/projectItemSnapshots');

async function main() {
  if (!process.env.DB_NAME) throw Error('Set DB_NAME explicitly in server/.env before upgrading.');
  if (!process.argv.includes('--apply')) throw Error('Back up the database and stop the app, then run: node scripts/upgrade-oct29.js --apply');
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  });
  try {
    console.log('Upgrading configured database:', process.env.DB_NAME);
    const [tables] = await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");
    const counts = async () => {
      const result = {};
      for (const table of tables) {
        const name = table.TABLE_NAME;
        const [[row]] = await db.query('SELECT COUNT(*) AS total FROM ??', [name]);
        result[name] = String(row.total);
      }
      return result;
    };
    const before = await counts();
    await ensureProjectItemSnapshots(db);
    const after = await counts();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Row counts changed during upgrade; investigate before restarting.');
    const [columns] = await db.query("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='projects' AND COLUMN_NAME='import_source') OR (TABLE_NAME='panel_crm_items' AND COLUMN_NAME IN ('markupP_pct','markupM_pct','manpower_pct')))");
    const [triggers] = await db.query("SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('crm_snapshot_insert','crm_snapshot_replace')");
    if (columns.length !== 4 || triggers.length !== 2) throw Error('Upgrade verification incomplete.');
    console.log(JSON.stringify({ columns, triggers, tablesChecked: tables.length, rowCountsUnchanged: true }, null, 2));
    console.log('Upgrade complete. Existing tables and rows retained.');
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
