// Compare a pasted mysqldump schema with this release in disposable LOCAL databases.
// Only extracted CREATE TABLE statements are read from the export; never its DROP statements.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const config = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true };
const prefix = 'schema_compare_' + Date.now();
const names = [prefix + '_online', prefix + '_release'];
const quote = value => '`' + value.replace(/`/g, '``') + '`';
let db;
async function inspect(name) {
  const [columns] = await db.query('SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, ORDINAL_POSITION', [name]);
  const [indexes] = await db.query('SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX', [name]);
  const [foreignKeys] = await db.query('SELECT k.TABLE_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=? AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.COLUMN_NAME', [name]);
  return { columns, indexes, foreignKeys };
}
async function main() {
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) throw Error('Local MySQL only');
  if (!process.argv[2]) throw Error('Usage: node scripts/compare-schema-export.js <schema-export.txt>');
  const exported = fs.readFileSync(process.argv[2], 'utf8');
  const creates = [...exported.matchAll(/^CREATE TABLE `\w+` \([\s\S]*?^\) ENGINE=InnoDB[^;]*;/gm)].map(match => match[0]);
  if (!creates.length) throw Error('No exported InnoDB table definitions found');
  db = await mysql.createConnection(config);
  const [[version]] = await db.query('SELECT VERSION() AS version');
  console.log('Local validation engine:', version.version);
  // Normalize BOTH disposable schemas for local MariaDB, which lacks MySQL 8's 0900 collation.
  const localCollation = version.version.includes('MariaDB') ? 'utf8mb4_unicode_ci' : 'utf8mb4_0900_ai_ci';
  for (const name of names) await db.query('CREATE DATABASE ' + quote(name) + ' CHARACTER SET utf8mb4 COLLATE ' + localCollation);
  await db.query('USE ' + quote(names[0]));
  await db.query('SET FOREIGN_KEY_CHECKS=0');
  for (const sql of creates) await db.query(sql.replaceAll('utf8mb4_0900_ai_ci', localCollation));
  await db.query('SET FOREIGN_KEY_CHECKS=1');
  await db.query('USE ' + quote(names[1]));
  let releaseSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  // Explicit NULL matches MySQL 8 defaults; do not alter the host's global MariaDB settings.
  if (version.version.includes('MariaDB')) releaseSql = releaseSql.replace(/\bTIMESTAMP\s+DEFAULT/gi, 'TIMESTAMP NULL DEFAULT');
  await db.query(releaseSql);
  const online = await inspect(names[0]);
  const release = await inspect(names[1]);
  const key = row => row.TABLE_NAME + '.' + row.COLUMN_NAME;
  const missing = release.columns.filter(row => !online.columns.some(old => key(old) === key(row)));
  const extra = online.columns.filter(row => !release.columns.some(next => key(next) === key(row)));
  const changed = release.columns.flatMap(row => {
    const old = online.columns.find(old => key(old) === key(row));
    return old && JSON.stringify(old) !== JSON.stringify(row) ? [{ column: key(row), online: old, release: row }] : [];
  });
  const canonicalIndexes = rows => {
    const groups = new Map();
    for (const row of rows) {
      const id = row.TABLE_NAME + '.' + row.INDEX_NAME;
      if (!groups.has(id)) groups.set(id, { table: row.TABLE_NAME, unique: !row.NON_UNIQUE, primary: row.INDEX_NAME === 'PRIMARY', columns: [] });
      groups.get(id).columns.push([row.COLUMN_NAME, row.SUB_PART]);
    }
    return [...groups.values()];
  };
  const difference = (a, b) => a.filter(row => !b.some(other => JSON.stringify(row) === JSON.stringify(other)));
  const report = { exportedTables: creates.length, releaseTables: new Set(release.columns.map(row => row.TABLE_NAME)).size, missing, extra, changed, missingIndexes: difference(canonicalIndexes(release.indexes), canonicalIndexes(online.indexes)), extraIndexes: difference(canonicalIndexes(online.indexes), canonicalIndexes(release.indexes)), missingForeignKeys: difference(release.foreignKeys, online.foreignKeys), extraForeignKeys: difference(online.foreignKeys, release.foreignKeys) };
  const output = path.join(__dirname, '../../../scratch/online-schema-comparison.json');
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (process.argv[3]) {
    await db.query('USE ' + quote(names[0]));
    // Fixtures exercise populated tables, null fields, decimal values and timestamp preservation.
    await db.query("INSERT INTO brands(id,name) VALUES(990001,'Migration fixture'); INSERT INTO clients(id,name,phone,credit_limit,created_at) VALUES(990001,'Migration fixture',NULL,123.45,'2020-01-02 03:04:05'); INSERT INTO product_discounts(id,brand_id,discount_pct,created_at) VALUES(990001,990001,12.5,'2020-01-02 03:04:05')");
    const before = [];
    for (const table of ['clients', 'product_discounts']) before.push((await db.query('SELECT * FROM ' + quote(table)))[0]);
    const migration = fs.readFileSync(process.argv[3], 'utf8');
    const countsSql = fs.readFileSync(path.join(__dirname, '../db/migrations/20260930_verify_counts.sql'), 'utf8');
    const [beforeCounts] = await db.query(countsSql);
    await db.query(migration);
    await db.query(migration); // Reruns must preserve data and succeed.
    const after = [];
    for (const table of ['clients', 'product_discounts']) after.push((await db.query('SELECT * FROM ' + quote(table)))[0]);
    before.forEach((rows, index) => rows.forEach((row, rowIndex) => Object.entries(row).forEach(([column, value]) => {
      if (JSON.stringify(value) !== JSON.stringify(after[index][rowIndex][column])) throw Error('Migration changed existing value: ' + column);
    })));
    const migrated = await inspect(names[0]);
    const remaining = release.columns.filter(row => !migrated.columns.some(current => key(current) === key(row)));
    if (remaining.length) throw Error('Migration left missing columns');
    if (difference(release.columns, migrated.columns).length || difference(canonicalIndexes(release.indexes), canonicalIndexes(migrated.indexes)).length) throw Error('Migration did not match release columns/indexes');
    const [afterCounts] = await db.query(countsSql);
    if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) throw Error('Migration changed counts or totals');
    console.log('Migration applied twice; fixture rows and all original field values preserved; all 36 table counts and checked totals unchanged; columns/indexes match release.');
  }
}
main().catch(error => { console.error(error.message || error.code); process.exitCode = 1; }).finally(async () => {
  if (db) {
    for (const name of names) {
      if (!/^schema_compare_\d+_(online|release)$/.test(name)) throw Error('Unsafe cleanup target');
      await db.query('DROP DATABASE IF EXISTS ' + quote(name));
    }
    await db.end();
  }
});
