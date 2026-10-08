// Local-only migration rehearsal and application, with a logical backup and data verification.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const config = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'elec_app', multipleStatements: true };
const quote = value => '`' + value.replace(/`/g, '``') + '`';
const output = path.join(__dirname, '../../../scratch');
const apply = process.argv.includes('--apply');
const target = apply ? config.database : 'migration_rehearsal_' + Date.now();
let db;
async function snapshot(database, inventory) {
  const result = {};
  for (const table of inventory) {
    const [rows] = await db.query(`SELECT ${table.columns.map(quote).join(',')} FROM ${quote(database)}.${quote(table.name)}`);
    const canonical = rows.map(row => JSON.stringify(row)).sort();
    result[table.name] = { count: rows.length, hash: crypto.createHash('sha256').update(canonical.join('\n')).digest('hex') };
  }
  return result;
}
async function main() {
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) throw Error('Local databases only');
  fs.mkdirSync(output, { recursive: true });
  db = await mysql.createConnection(config);
  const [rows] = await db.query('SHOW FULL TABLES WHERE Table_type="BASE TABLE"');
  const inventory = [];
  for (const row of rows) {
    const name = Object.values(row)[0];
    const [columns] = await db.query('SHOW COLUMNS FROM ' + quote(name));
    inventory.push({ name, columns: columns.map(column => column.Field) });
  }
  const original = await snapshot(config.database, inventory);
  let backup;
  if (apply) {
    backup = path.join(output, 'database-before-migration-' + Date.now() + '.sql');
    const dump = spawnSync('C:\\xampp\\mysql\\bin\\mysqldump.exe', ['--host=' + config.host, '--port=' + config.port, '--user=' + config.user, '--single-transaction', '--routines', '--events', '--hex-blob', '--result-file=' + backup, config.database], { env: { ...process.env, MYSQL_PWD: config.password }, windowsHide: true, encoding: 'utf8' });
    if (dump.status !== 0 || !fs.existsSync(backup) || fs.statSync(backup).size < 100) throw Error('Database backup failed; migration cancelled');
  } else {
    await db.query('CREATE DATABASE ' + quote(target));
    await db.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of inventory) {
      const [[definition]] = await db.query('SHOW CREATE TABLE ' + quote(table.name));
      await db.query(definition['Create Table'].replace('CREATE TABLE ' + quote(table.name), 'CREATE TABLE ' + quote(target) + '.' + quote(table.name)));
      await db.query(`INSERT INTO ${quote(target)}.${quote(table.name)} SELECT * FROM ${quote(config.database)}.${quote(table.name)}`);
    }
    await db.query('SET FOREIGN_KEY_CHECKS=1');
  }
  await db.query('USE ' + quote(target));
  const before = await snapshot(target, inventory);
  const migration = fs.readFileSync(path.join(__dirname, '../db/migrations/20260930_clients_discounts_audit.sql'), 'utf8');
  await db.query(migration);
  await db.query(migration);
  const after = await snapshot(target, inventory);
  if (JSON.stringify(before) !== JSON.stringify(after) || JSON.stringify(original) !== JSON.stringify(before)) throw Error('Existing data changed during verification');
  const [checks] = await db.query('CHECK TABLE ' + inventory.map(table => quote(table.name)).join(','));
  const failures = checks.filter(row => row.Msg_type !== 'status' || row.Msg_text !== 'OK');
  const [keys] = await db.query('SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL', [target]);
  const orphans = [];
  for (const key of keys) {
    const [[row]] = await db.query(`SELECT COUNT(*) AS count FROM ${quote(key.TABLE_NAME)} c LEFT JOIN ${quote(key.REFERENCED_TABLE_NAME)} p ON c.${quote(key.COLUMN_NAME)}=p.${quote(key.REFERENCED_COLUMN_NAME)} WHERE c.${quote(key.COLUMN_NAME)} IS NOT NULL AND p.${quote(key.REFERENCED_COLUMN_NAME)} IS NULL`);
    if (Number(row.count)) orphans.push({ table: key.TABLE_NAME, column: key.COLUMN_NAME, count: Number(row.count) });
  }
  const report = { mode: apply ? 'applied' : 'rehearsed', timestamp: new Date().toISOString(), tables: inventory.length, rows: Object.values(after).reduce((sum, row) => sum + row.count, 0), existingDataUnchanged: true, migrationAppliedTwice: true, integrityFailures: failures, foreignKeysChecked: keys.length, orphans, ...(backup ? { backup } : {}) };
  fs.writeFileSync(path.join(output, apply ? 'database-verification.json' : 'migration-rehearsal.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length || orphans.length) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (!db) return;
  if (!apply && /^migration_rehearsal_\d+$/.test(target) && target !== config.database) await db.query('DROP DATABASE IF EXISTS ' + quote(target));
  await db.end();
});
