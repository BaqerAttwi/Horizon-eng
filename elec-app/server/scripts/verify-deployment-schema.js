// Imports only into a disposable local database; never changes the application database.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const target = 'schema_verify_' + Date.now();
const quote = name => '`' + name.replace(/`/g, '``') + '`';
let connection;
async function main() {
  const host = process.env.DB_HOST || 'localhost';
  if (!['localhost','127.0.0.1','::1'].includes(host)) throw Error('Local verification only');
  connection = await mysql.createConnection({ host, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', multipleStatements: true });
  await connection.query('CREATE DATABASE ' + quote(target));
  await connection.query('USE ' + quote(target));
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  await connection.query(schema);
  await connection.query(schema);
  const [tables] = await connection.query('SHOW TABLES');
  const [checks] = await connection.query('CHECK TABLE ' + tables.map(row => quote(Object.values(row)[0])).join(','));
  const failures = checks.filter(row => row.Msg_type !== 'status' || row.Msg_text !== 'OK');
  const [missing] = await connection.execute(`SELECT live.TABLE_NAME,live.COLUMN_NAME FROM information_schema.COLUMNS live LEFT JOIN information_schema.COLUMNS fresh ON fresh.TABLE_SCHEMA=? AND fresh.TABLE_NAME=live.TABLE_NAME AND fresh.COLUMN_NAME=live.COLUMN_NAME WHERE live.TABLE_SCHEMA=? AND fresh.COLUMN_NAME IS NULL`, [target, process.env.DB_NAME || 'elec_app']);
  const report = { freshImport:true, repeatedImport:true, tables:tables.length, integrityFailures:failures, liveColumnsMissingFromSchema:missing };
  fs.writeFileSync(path.join(__dirname, '../../../scratch/deployment-schema-check.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if (failures.length || missing.length) process.exitCode = 1;
}
main().catch(error => { console.error('Schema verification failed:', error.code, error.message); process.exitCode = 1; }).finally(async () => {
  if (connection) { await connection.query('DROP DATABASE IF EXISTS ' + quote(target)); await connection.end(); }
});
