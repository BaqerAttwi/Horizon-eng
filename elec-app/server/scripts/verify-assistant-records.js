// Read-only smoke check against the configured local database; prints no record contents.
const path = require('node:path');
require('dotenv').config({ path:path.join(__dirname,'../.env'), quiet:true });
const mysql = require('mysql2/promise');
const { ROLES } = require('../utils/rolePolicy');
const { readRecords } = require('../utils/assistantRecords');
async function main() {
  const host = process.env.DB_HOST || 'localhost';
  if (!['localhost','127.0.0.1','::1'].includes(host)) throw Error('This check supports only a local database.');
  const db = await mysql.createConnection({ host, port:Number(process.env.DB_PORT || 3306), user:process.env.DB_USER || 'root', password:process.env.DB_PASSWORD || '', database:process.env.DB_NAME || 'elec_app' });
  try {
    for (const role of ROLES) {
      const [workers] = await db.execute('SELECT id FROM workers WHERE role=? LIMIT 1',[role]);
      const worker = { id:workers[0]?.id || 0, name:'Smoke check', role };
      for (const intent of ['daily','projects','stock','clients','debt','approvals','requests']) {
        const result = await readRecords(db,worker,intent,intent==='daily'?'today':`find ${intent==='projects'?'project':intent==='clients'?'client':'product'} "__assistant_smoke_no_match__"`);
        if (!result || typeof result.reply !== 'string') throw Error(`Invalid result: ${role}/${intent}`);
      }
      console.log(`PASS ${role}: live queries and record access checks${workers.length ? '' : ' (no account; empty assignment scope)'}`);
    }
  } finally { await db.end(); }
}
main().catch(error => { console.error('Assistant record check failed:',error.code || error.message); process.exitCode=1; });
