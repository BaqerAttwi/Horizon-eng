const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const target = 'live_upgrade_verify_' + Date.now();
let connection;
async function main() {
  const baseline = process.argv[2];
  if (!baseline) throw Error('Pass the old schema file as the argument');
  const host = process.env.DB_HOST || 'localhost';
  if (!['localhost','127.0.0.1','::1'].includes(host)) throw Error('Local checks only');
  connection = await mysql.createConnection({host,user:process.env.DB_USER || 'root',password:process.env.DB_PASSWORD || '',port:Number(process.env.DB_PORT || 3306),multipleStatements:true});
  await connection.query('CREATE DATABASE `' + target + '`');
  await connection.query('USE `' + target + '`');
  await connection.query(fs.readFileSync(baseline,'utf8'));
  await connection.query("INSERT INTO workers(name,role,password_hash) VALUES('Migration test','owner','synthetic'); INSERT INTO projects(project_name,admin_approval) VALUES('Preserved project','approved');");
  const [tables] = await connection.query('SHOW TABLES');
  const names = tables.map(row => Object.values(row)[0]);
  async function snapshot() {
    const data = {};
    for (const name of names) { const [rows] = await connection.query('SELECT * FROM `' + name + '`'); data[name] = rows.map(row => JSON.stringify(row)).sort(); }
    return JSON.stringify(data);
  }
  const before = await snapshot();
  const sql = fs.readFileSync(path.join(__dirname,'../db/migrations/20261008_live_upgrade.sql'),'utf8');
  await connection.query(sql);
  await connection.query(sql);
  if (before !== await snapshot()) throw Error('Existing records changed');
  await connection.query("UPDATE projects SET admin_approval='recheck' WHERE project_name='Preserved project'; UPDATE projects SET admin_approval='cancelled' WHERE project_name='Preserved project';");
  console.log('PASS: old schema upgraded twice; existing records unchanged; new approval values accepted.');
}
main().catch(error => { console.error(error.code || '', error.message); process.exitCode=1; }).finally(async()=> {if(connection){await connection.query('DROP DATABASE IF EXISTS `' + target + '`');await connection.end();}});
