// Exercises routes only against a disposable local database copy.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const mysql = require('mysql2/promise');
const source = process.env.DB_NAME || 'elec_app';
const target = 'elec_app_audit_' + Date.now();
const config = { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: source };
const quote = name => '`' + name.replace(/`/g, '``') + '`';
let connection, server, pool;
const results = [];
async function main() {
  if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) throw Error('The audit is restricted to a local database');
  connection = await mysql.createConnection(config);
  await connection.query('CREATE DATABASE ' + quote(target));
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  const [tables] = await connection.query('SHOW FULL TABLES WHERE Table_type="BASE TABLE"');
  for (const row of tables) {
    const table = Object.values(row)[0];
    await connection.query({ sql: 'CREATE TABLE ' + quote(target) + '.' + quote(table) + ' LIKE ' + quote(source) + '.' + quote(table), timeout: 10000 });
    if (table === 'workers') await connection.query('INSERT INTO ' + quote(target) + '.' + quote(table) + ' SELECT * FROM ' + quote(source) + '.' + quote(table));
  }
  await connection.query('SET FOREIGN_KEY_CHECKS=1');
  // Optional migration validation is confined to the disposable database.
  if (process.argv.includes('--migrate-copy')) {
    const migration = await mysql.createConnection({ ...config, database: target, multipleStatements: true });
    try { await migration.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8')); }
    finally { await migration.end(); }
  }
  process.env.DB_NAME = target;
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const assert = require('node:assert/strict');
  const app = express(); app.use(express.json()); app.use('/api',require('../routes')); app.use(require('../middleware/errorHandler').errorHandler);
  pool = require('../db/connection');
  server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  const root = 'http://127.0.0.1:'+server.address().port+'/api';
  const [[owner]]=await pool.execute("SELECT id,password_hash FROM workers WHERE role='owner' LIMIT 1");
  const [worker]=await pool.execute("INSERT INTO workers(name,email,role,password_hash) VALUES('Approval test','approval-test@example.invalid','engineer',?)", [owner.password_hash]);
  const secret=require('../controllers/authController').JWT_SECRET;
  const ownerToken=jwt.sign({id:owner.id,credential:require('../utils/accountSecurity').passwordFingerprint(owner.password_hash)},secret), engineerToken=jwt.sign({id:worker.insertId,credential:require('../utils/accountSecurity').passwordFingerprint(owner.password_hash)},secret);
  async function request(method,url,body,expected=200,token=engineerToken){
    const response=await fetch(root+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
    const data=await response.json(); assert.equal(response.status,expected,method+' '+url+' '+JSON.stringify(data));
    results.push({method,url,status:response.status});return data;
  }
  const project=await request('POST','/projects',{project_name:'Approval integration test'},201);
  const id=project.id; assert.equal(project.total_price,null);
  await request('PATCH','/projects/'+id,{notes:'Technical note'});
  await request('PATCH','/projects/'+id+'/stage',{stage:'quotation'},400);
  await request('PATCH','/projects/'+id+'/ready-for-review',{});
  await request('POST','/projects/'+id+'/panels',{panel_number:1},423);
  await request('PATCH','/projects/'+id,{notes:'Attempt while submitted'},423);
  await request('PATCH','/projects/'+id+'/admin-approval',{admin_approval:'recheck'},400,ownerToken);
  await request('PATCH','/projects/'+id+'/admin-approval',{admin_approval:'recheck',rejection_note:'Please change quantity'},200,ownerToken);
  const panel=await request('POST','/projects/'+id+'/panels',{panel_number:1,panel_name:'Panel 1'},201);
  await request('PATCH','/projects/'+id+'/ready-for-review',{});
  await request('PATCH','/projects/'+id+'/admin-approval',{admin_approval:'approved'},200,ownerToken);
  const quotation=await request('PATCH','/projects/'+id+'/stage',{stage:'quotation'}); assert.equal(quotation.total_price,null);
  await request('PATCH','/projects/'+id+'/panels/'+panel.id,{quantity:2});
  let state=await request('GET','/projects/'+id);assert.equal(state.admin_approval,'pending');assert.equal(state.ready_for_review,0);assert.equal(state.project_stage,'design');
  await request('PATCH','/projects/'+id+'/ready-for-review',{});
  await request('PATCH','/projects/'+id+'/admin-approval',{admin_approval:'approved'},200,ownerToken);
  await request('PATCH','/projects/'+id,{client_approval:'approved'},200,ownerToken);
  state=await request('GET','/projects/'+id);assert.equal(state.admin_approval,'approved');
  await request('PATCH','/projects/'+id+'/admin-approval',{admin_approval:'cancelled',rejection_note:'Canceled by client'},200,ownerToken);
  await request('PATCH','/projects/'+id+'/panels/'+panel.id,{quantity:3},423,ownerToken);
  await request('PATCH','/projects/'+id+'/panels/'+panel.id+'/complete',{},423,ownerToken);
  await request('PATCH','/projects/'+id+'/stage',{stage:'quotation'},400);
  await request('PATCH','/projects/'+id+'/admin-approval',{admin_approval:'pending'},200,ownerToken);
  await request('PATCH','/projects/'+id,{notes:'Reopened'});
  const history=await request('GET','/projects/'+id+'/review-history');assert.ok(history.some(row=>row.note==='Please change quantity'));assert.ok(history.some(row=>row.action==='changes_require_review'));assert.ok(history.some(row=>row.action==='reopened'));
  const emails=await request('GET','/projects/'+id+'/email-deliveries');assert.ok(emails.length>=4);assert.ok(emails.every(row=>row.status==='queued'));
  console.log('Approval API integration: '+results.length+' requests passed; history, privacy, locks and queued emails verified. No emails sent.');
}
main().catch(error=>{console.error('Approval integration failed:',error.message);process.exitCode=1;}).finally(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 if(pool){await require('../middleware/projectReview').closeReviewLocks();await pool.end();}
 if(connection){const cleanup=await mysql.createConnection(config);try{await cleanup.query('SET SESSION lock_wait_timeout=5');if(/^elec_app_audit_\d+$/.test(target)&&target!==source)await cleanup.query({sql:'DROP DATABASE IF EXISTS '+quote(target),timeout:10000});}catch(error){console.error('Disposable audit cleanup needs retry for '+target+': '+error.code);}finally{await cleanup.end();connection.destroy();}}
});
